(function (root, factory) {
  const theory = root.AirmonMusicTheory || (typeof require === 'function' ? require('./music-theory') : null);
  const model = root.AirmonScoreModel || (typeof require === 'function' ? require('./score-model') : null);
  const api = factory(theory, model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirmonPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (theory, model) {
  'use strict';

  function buildPlaybackSegments(score) {
    const order = model?.playbackMeasureOrder ? model.playbackMeasureOrder(score) : score.measures.map((_, measureIndex) => ({ measureIndex, pass: 1 }));
    let playbackCursor = 0;
    return order.map(item => {
      const bounds = model.measureBounds(score, item.measureIndex);
      const segment = { ...item, notatedStart: bounds.start, notatedEnd: bounds.end, capacity: bounds.capacity, playStart: playbackCursor, playEnd: playbackCursor + bounds.capacity };
      playbackCursor += bounds.capacity;
      return segment;
    });
  }

  function playbackRange(score, segments, startBeat, range = null) {
    const total = model.totalBeats(score);
    const rangeStart = range?.start == null ? 0 : theory.clamp(Number(range.start) || 0, 0, Math.max(0, total - 1e-8));
    const requestedStart = Number(startBeat);
    const normalizedStart = theory.clamp(Number.isFinite(requestedStart) ? requestedStart : rangeStart, rangeStart, Math.max(rangeStart, total - 1e-8));
    const normalizedEnd = range?.end == null ? total : theory.clamp(Number(range.end) || total, normalizedStart + 1e-8, total);
    const startMeasure = model.measureIndexAt(score, normalizedStart);
    const firstSegment = segments.find(segment => segment.measureIndex === startMeasure) || segments[0];
    const startPlayBeat = (firstSegment?.playStart || 0) + Math.max(0, normalizedStart - (firstSegment?.notatedStart || 0));
    let endPlayBeat = segments.at(-1)?.playEnd || total;
    if (range?.end != null) {
      const endMeasure = model.measureIndexAt(score, Math.max(0, normalizedEnd - 1e-8));
      const endSegment = segments.find(segment => segment.measureIndex === endMeasure && segment.playEnd > startPlayBeat + 1e-8);
      if (endSegment) endPlayBeat = Math.min(endSegment.playEnd, endSegment.playStart + Math.max(0, normalizedEnd - endSegment.notatedStart));
    }
    return { start: normalizedStart, end: normalizedEnd, startPlayBeat, endPlayBeat };
  }

  function mergedTiedEvents(score, part) {
    const notes = (part.events || []).filter(event => event.type === 'note').sort((a, b) => a.start - b.start || a.midi - b.midi);
    const byId = new Map(notes.map(event => [event.id, event]));
    const incoming = new Map();
    const outgoing = new Map();
    for (const spanner of score.spanners || []) if (spanner.type === 'tie') {
      incoming.set(spanner.endEventId, spanner.startEventId);
      outgoing.set(spanner.startEventId, spanner.endEventId);
    }
    return notes.filter(event => !incoming.has(event.id) && !event.tieStop).map(event => {
      let current = event;
      let duration = Number(event.duration) || 0;
      const visited = new Set([event.id]);
      while (true) {
        let next = byId.get(outgoing.get(current.id));
        if (!next && current.tieStart) next = notes.find(candidate => !visited.has(candidate.id) && candidate.midi === current.midi && candidate.voice === current.voice && candidate.staff === current.staff && Math.abs(candidate.start - (current.start + current.duration)) < 1e-8);
        if (!next || visited.has(next.id) || Number(next.midi) !== Number(event.midi)) break;
        duration += Number(next.duration) || 0;
        visited.add(next.id); current = next;
      }
      return { ...event, duration, tiedEventIds: Array.from(visited) };
    });
  }

  function buildPlaybackNotes(score) {
    return (score.parts || []).flatMap((part, partIndex) => mergedTiedEvents(score, part).map(event => ({ part, partIndex, event })));
  }

  function buildMetronomeBeats(score, segments = buildPlaybackSegments(score), startPlayBeat = 0, endPlayBeat = null) {
    const maximum = endPlayBeat == null ? (segments.at(-1)?.playEnd || model.totalBeats(score)) : Number(endPlayBeat);
    const beats = [];
    for (const segment of segments) {
      const from = Math.max(segment.playStart, Number(startPlayBeat) || 0);
      const to = Math.min(segment.playEnd, maximum);
      if (to <= from + 1e-8) continue;
      const first = Math.max(0, Math.ceil(from - segment.playStart - 1e-8));
      for (let beatInMeasure = first; segment.playStart + beatInMeasure < to - 1e-8; beatInMeasure += 1) {
        beats.push({
          playBeat: segment.playStart + beatInMeasure,
          notatedBeat: segment.notatedStart + beatInMeasure,
          measureIndex: segment.measureIndex,
          pass: segment.pass || 1,
          beatInMeasure,
          accent: beatInMeasure === 0
        });
      }
    }
    return beats;
  }

  class PlaybackEngine {
    constructor() {
      this.context = null;
      this.nodes = [];
      this.timer = null;
      this.playing = false;
      this.startedAt = 0;
      this.startBeat = 0;
      this.currentBeat = 0;
      this.maxBeat = 0;
      this.score = null;
      this.loop = false;
      this.loopRange = null;
      this.metronome = false;
      this.layerMix = {};
      this.onPosition = null;
      this.onStop = null;
    }

    ensureContext() {
      const scope = typeof window !== 'undefined' ? window : globalThis;
      const AudioContextClass = scope?.AudioContext || scope?.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Audio playback is unavailable because no Web Audio output is available.');
      if (!this.context) this.context = new AudioContextClass();
      return this.context;
    }

    stop(options = {}) {
      const notify = options.notify !== false;
      const reset = options.reset === true;
      this.nodes.forEach(node => { try { node.stop(); } catch (_) {} });
      this.nodes = [];
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.playing = false;
      if (reset) this.currentBeat = 0;
      if (notify && this.onStop) this.onStop({ beat: this.currentBeat, natural: Boolean(options.natural) });
    }

    play(score, startBeat = 0, loop = false, loopRange = null, options = {}) {
      this.stop({ notify: false });
      const context = this.ensureContext();
      if (context.state === 'suspended') context.resume();
      const secondsPerBeat = 60 / score.settings.tempo;
      const countInBeats = Math.max(0, Number(options.countInBeats) || 0);
      const countInStart = context.currentTime + 0.06;
      const now = countInStart + countInBeats * secondsPerBeat;
      this.score = score;
      this.loop = Boolean(loop);
      this.loopRange = loopRange && Number(loopRange.end) > Number(loopRange.start) ? { start: Number(loopRange.start), end: Number(loopRange.end) } : null;
      this.metronome = Boolean(options.metronome);
      this.layerMix = options.layerMix && typeof options.layerMix === 'object' ? options.layerMix : {};
      const segments = buildPlaybackSegments(score);
      const range = playbackRange(score, segments, startBeat, this.loopRange);
      this.startBeat = range.start;
      this.currentBeat = this.startBeat;
      this.playing = true;
      this.startedAt = now;
      this.startPlayBeat = range.startPlayBeat;
      this.maxBeat = range.endPlayBeat;
      this.playbackSegments = segments;
      const startPlayBeat = range.startPlayBeat;
      const soloed = score.parts.some(part => part.solo);
      const voiceSoloed = Object.values(this.layerMix).some(item => Boolean(item?.solo));

      segments.forEach(segment => {
        if (segment.playEnd <= startPlayBeat + 1e-8 || segment.playStart >= this.maxBeat - 1e-8) return;
        score.parts.forEach((part, partIndex) => {
          if (part.muted || (soloed && !part.solo)) return;
          mergedTiedEvents(score, part).filter(event => event.start >= segment.notatedStart - 1e-8 && event.start < segment.notatedEnd - 1e-8).forEach(event => {
            const voiceMix = this.layerMix[String(event.voice || 1)] || this.layerMix[event.voice || 1] || {};
            if (voiceMix.muted || (voiceSoloed && !voiceMix.solo)) return;
            const occurrenceStart = segment.playStart + (event.start - segment.notatedStart);
            if (occurrenceStart >= this.maxBeat - 1e-8) return;
            const eventStart = Math.max(occurrenceStart, startPlayBeat);
            const offset = (eventStart - startPlayBeat) * secondsPerBeat;
            const eventEnd = Math.min(this.maxBeat, occurrenceStart + event.duration);
            const duration = Math.max(0.04, (eventEnd - eventStart) * secondsPerBeat);
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const panner = context.createStereoPanner ? context.createStereoPanner() : null;
            oscillator.type = partIndex === 0 ? 'sine' : 'triangle';
            oscillator.frequency.value = theory.frequencyForMidi(event.midi);
            const layerVolume = Math.max(0, Math.min(1, Number(voiceMix.volume ?? 1)));
            const volume = Math.max(0, Math.min(1, (part.volume ?? 0.8) * layerVolume * ((event.velocity || 88) / 127) * 0.18));
            gain.gain.setValueAtTime(0.0001, now + offset);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + offset + 0.015);
            gain.gain.setValueAtTime(Math.max(0.0002, volume * 0.75), now + offset + Math.max(0.02, duration - 0.05));
            gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
            if (panner) { panner.pan.value = part.pan || 0; oscillator.connect(gain).connect(panner).connect(context.destination); }
            else oscillator.connect(gain).connect(context.destination);
            oscillator.start(now + offset); oscillator.stop(now + offset + duration + 0.02); this.nodes.push(oscillator);
          });
        });
      });

      if (countInBeats > 0) {
        for (let beat = 0; beat < countInBeats; beat += 1) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'square';
          oscillator.frequency.value = beat % Math.max(1, model?.beatsPerMeasure?.(score, 0) || 4) === 0 ? 1500 : 1000;
          const startAt = countInStart + beat * secondsPerBeat;
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(beat === 0 ? 0.13 : 0.075, startAt + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.05);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.055);
          this.nodes.push(oscillator);
        }
      }

      if (this.metronome) {
        for (const click of buildMetronomeBeats(score, segments, startPlayBeat, this.maxBeat)) {
          const offset = (click.playBeat - startPlayBeat) * secondsPerBeat;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'square';
          oscillator.frequency.value = click.accent ? 1400 : 950;
          const startAt = now + Math.max(0, offset);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(click.accent ? 0.11 : 0.065, startAt + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.045);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.05);
          this.nodes.push(oscillator);
        }
      }

      this.timer = setInterval(() => {
        if (!this.playing) return;
        const playBeat = this.startPlayBeat + Math.max(0, context.currentTime - this.startedAt) / secondsPerBeat;
        const segment = this.playbackSegments.find(item => playBeat >= item.playStart - 1e-8 && playBeat < item.playEnd - 1e-8) || this.playbackSegments.at(-1);
        const notatedBeat = segment ? segment.notatedStart + Math.min(segment.capacity, Math.max(0, playBeat - segment.playStart)) : this.startBeat;
        this.currentBeat = notatedBeat;
        if (this.onPosition) this.onPosition(notatedBeat, { playBeat, measureIndex: segment?.measureIndex, pass: segment?.pass || 1 });
        if (playBeat >= this.maxBeat + 0.05) {
          if (this.loop) this.play(score, this.loopRange?.start ?? this.startBeat, true, this.loopRange, { metronome: this.metronome, layerMix: this.layerMix });
          else this.stop({ natural: true });
        }
      }, 30);
    }

    seek(score, beat, loop = false, loopRange = null, options = {}) {
      const wasPlaying = this.playing;
      this.currentBeat = Math.max(0, Number(beat) || 0);
      if (wasPlaying) this.play(score, this.currentBeat, loop, loopRange || this.loopRange, {
        metronome: options.metronome ?? this.metronome,
        layerMix: options.layerMix || this.layerMix
      });
      else if (this.onPosition) this.onPosition(this.currentBeat);
    }

    async shutdown() {
      this.stop({ notify: false });
      this.onPosition = null;
      this.onStop = null;
      const context = this.context;
      this.context = null;
      this.score = null;
      this.playbackSegments = [];
      if (context && context.state !== 'closed' && typeof context.close === 'function') await context.close();
      return true;
    }
  }

  return { PlaybackEngine, buildPlaybackSegments, playbackRange, mergedTiedEvents, buildPlaybackNotes, buildMetronomeBeats };
});
