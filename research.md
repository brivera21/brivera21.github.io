---
layout: page
title: Research
permalink: /research/
---

# Research Overview

My research investigates the neural mechanisms underlying mathematical thinking, with particular emphasis on numerical cognition and fraction processing. I use advanced electrophysiological methods (EEG/ERP) combined with behavioral experiments to understand how the brain processes mathematical information.

<figure class="photo">
  <div class="eeg-carousel">
    <img src="{{ '/images/eeg-1.jpg' | relative_url }}" alt="EEG data collection session in the lab">
    <img src="{{ '/images/eeg-2.jpg' | relative_url }}" alt="Applying an EEG electrode cap">
  </div>
  <figcaption>Recording EEG during mathematical cognition experiments.</figcaption>
</figure>


## Publications

- Salehzadeh, R., Rivera, B., Man, K., Jalili, N., & Soylu, F. (2023). EEG decoding of finger numeral configurations with machine learning. *Journal of Numerical Cognition, 9*(1), 206–221. [https://doi.org/10.5964/jnc.10441](https://doi.org/10.5964/jnc.10441)
- Rivera, B., & Soylu, F. (2021). Incongruity in fraction verification elicits N270 and P300 ERP effects. *Neuropsychologia, 161*, 108015. [https://doi.org/10.1016/j.neuropsychologia.2021.108015](https://doi.org/10.1016/j.neuropsychologia.2021.108015)

## Research Questions

How does the brain represent and process numerical information? What neural mechanisms underlie mathematical learning difficulties? How can neuroscientific findings inform mathematics education?

## Current Projects

### [Multivariate EEG Decoding of Fraction Processing](/projects/fraction-decoding/)

Understanding how people access fraction magnitude is crucial for mathematics education, as fractions represent a fundamental gateway to higher-level mathematical concepts. This project applies cross-generalization decoding techniques to test whether neural representations of fraction magnitude are abstract or tied to specific surface forms. We examine whether brain patterns learned from one fraction notation (e.g., 2/4) can successfully predict equivalent fractions in different forms (e.g., 3/6, 4/8).

### [Fraction Scaling (Processing Costs of Fraction Comparisons Across Scales)](/projects/fraction-scaling/)

This behavioral study asks whether comparing fractions of the same magnitude but different scale—such as 1/2 versus 2/8—carries a processing cost, and whether that cost follows a numerical distance effect. Adults complete a fraction verification task with fractions shown in base form or scaled by ×2 or ×3.

<figure class="photo">
  <img src="{{ '/images/fraction-trial-structure.png' | relative_url }}" alt="Fraction scaling stimulus presentation order" class="site-photo">
  <figcaption>Stimulus presentation order. A prime fraction (1000 ms) is followed by a fixation cross (500 ms) and then a target fraction (shown until response). Targets appear in base, ×2, or ×3 form; match trials (green) share the prime magnitude, mismatch trials (red) do not.</figcaption>
</figure>

### [GRASP Experiment (Graph Reasoning and Symbolic Processing)](/projects/equation-graph-n400/)

GRASP asks whether the brain processes algebraic relationships using the same semantic mechanisms it uses for language. On each trial, participants view a line graph of an equation (y = mx + b) followed by a written equation and judge whether the two match; on mismatch trials, either the slope or the intercept is altered so the equation no longer fits the graph. We test whether these equation-graph mismatches elicit an N400 (~400 ms post-stimulus) — an ERP signature classically tied to semantic incongruity in language — and whether the type (slope vs. intercept) and magnitude of the violation modulate the response. EEG is recorded with a 16-channel system, and machine-learning classification is applied to the ERP data to predict violation detection from neural patterns.

<figure class="photo">
  <img src="{{ '/images/grasp-trial-sequence.png' | relative_url }}" alt="GRASP task stimulus presentation order" class="site-photo">
  <figcaption>Stimulus presentation order: the graph appears first, followed by the equation; shaded regions show the displacement (error) on mismatch trials.</figcaption>
</figure>

### [FAVE Experiment (Format-Dependent Arithmetic Verification with EEG)](/projects/fave/)

This EEG study tests whether numerical magnitude is represented by a single abstract code or by separate, format-specific systems. Participants verify addition and subtraction problems presented as Arabic numerals, number words, and dot arrays while we measure whether the N400 response to incorrect answers scales with violation distance across formats. This work was presented at the Minnesota Undergraduate Psychology Conference (MUPC 2026).

<figure class="photo">
  <img src="{{ '/images/fave-stimulus-presentation.png' | relative_url }}" alt="FAVE stimulus presentation order across three formats" class="site-photo" style="max-width: 380px; margin: 0 auto;">
  <figcaption>Stimulus presentation order. In each format—Arabic numerals, number words, and dot arrays—the first operand, the operator, the second operand, and the proposed answer each appear for 500 ms.</figcaption>
</figure>

<figure class="photo">
  <img src="{{ '/images/fave-conditions.png' | relative_url }}" alt="FAVE arithmetic verification conditions: correct, near, and far violations" class="site-photo" style="max-width: 460px; margin: 0 auto;">
  <figcaption>Verification conditions. For each problem the proposed answer is correct, a near violation (close to the correct value), or a far violation (distant), shown across all three formats.</figcaption>
</figure>
