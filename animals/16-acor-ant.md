# METAZOO — Ant Colony Optimization for Continuous Domains
## Worker Ant Character & Optimization Visualization Prompt

### 1. Context
You are designing the METAZOO character visualization for **Ant Colony Optimization for Continuous Domains (ACOR)**.

METAZOO is an interactive 3D optimization laboratory (Three.js) in which animal-inspired metaheuristic algorithms are visualized as species moving across a mathematically defined optimization terrain. Terrain height represents the objective value; the agent's logical position is (x1, x2).

The optimizer determines position and state. Your task is to design the species visualization, character identity, model direction, material direction, rigging considerations, locomotion, and the optimizer-state-to-animation system.

**This is not merely a character-modeling task.** The species must be designed for optimization-state visualization + real-time population animation + scientific interpretation.

Core rule: **Algorithm determines state. Animal visualization expresses that state.** The animal never decides where to move. The optimizer produces x_i^(t+1); the visual layer only decides how the animal appears to travel from x_i^t to x_i^(t+1).

Interpolation contract: given `previousPosition` and `currentPosition`, the visual layer may interpolate smoothly, but `currentPosition` must remain the exact destination. The animal cannot select intermediate logical points. Never modify optimizer output for animation quality. (Correct: "If algorithmState.role === ..., show a subtle treatment." Incorrect: "Change the destination to make a more natural path.")

Global visual target: premium scientific visualization x stylized naturalism x intelligent educational character design. Avoid childish mascots, toy proportions, documentary hyper-realism, fantasy creatures, glowing cyberpunk animals, robot animals, excessive armor, and sci-fi accessories. The animal must be instantly recognizable as its real species and remain readable on a large terrain at medium/far camera distance. Characters must not obscure terrain topology, position, trajectories, optimizer relationships, or overlays.

### 2. Species Identity
- Optimizer: Ant Colony Optimization for Continuous Domains
- Acronym: ACOR
- Species: Worker Ant
- Habitat category: Terrestrial / Ground Insect
- Visual scale class: XS
- Character personality: methodical, collective, memory-based, patient
- Algorithm-specific visual signature: **archive / pheromone-like solution information**

### 3. Algorithm States to Communicate
Only visually relevant states are listed; do not derive or rewrite the algorithm. These values are supplied by the optimizer layer (Phase 3).
- solution archive of k ranked solutions
- weights by rank
- Gaussian kernel sampling around chosen archive solution
- standard deviation derived from archive
- new solutions replacing worst archive entries

### 4. Character Design
Segmented ant: head, thorax, gaster, six legs, elbowed antennae. Clear 3-segment silhouette.

Required readable features at distance: overall silhouette, characteristic limb/wing proportions, head orientation (so heading reads clearly), and the signature feature named in Species Identity.

### 5. Shape Language
Three ellipsoids with thin legs.

### 6. Materials
Glossy chitin, small spec.
Use shared materials, restrained roughness, no excessive photoreal microtexture. Materials must remain readable under the METAZOO lighting rig.

### 7. Color Direction
Dark brown/black with amber joint accents.
Use biologically plausible color families. Semantic accents (see common system below) are small: band, rim, marker, ground ring, glyph. Never recolor the entire animal neon to express roles.

**Common METAZOO Semantic Accent System (shared by all species)**
- Selected: thin white/ice-blue ground ring + brief head-turn toward camera/UI focus. UI state only.
- Current Best: small gold crown-like scientific glyph above the agent + thin gold ground ring. Restrained, no beams, no bloom.
- Leader / Role: small role band, collar, rim line or marker in the common role palette (gold/silver/bronze for ranked roles; neutral teal for secondary roles).
- Inactive: slight desaturation (-25%) and reduced idle motion.
- Invalid / infeasible: desaturation, dashed ground ring, tiny warning glyph. The animal must not look injured, dead or punished.

### 8. Scale
Visual scale class **XS** (XS/S/M/L/XL relative to a generic METAZOO agent). This is visual only and never modifies mathematical position. Even if the real animal is large, constrain display scale so 30-50 individuals do not cover the terrain.

### 9. Idle Pose
Stationary with antennae scanning.
Used when paused, stationary, or at initialization. Initialization: short fade/settle into the exact initial position (no flying in from external positions that would imply fake trajectories). Reset: snap or <=250 ms transition to exact initial positions. Pause: settle naturally into idle; no meaningful optimization motion continues.

### 10. Locomotion
Primary locomotion: rapid low crawling. Locomotion never changes destination coordinates.
- Short movement: Brisk scurry.
- Medium movement: Steady crawl.
- Long movement / exploration jump: Quick crawl; no pretend trail-following.

Animation speed adapts to playback (0.5x, 1x, 2x, 4x) as visual pacing only; logical optimizer speed is unchanged. At 4x, reduce nonessential flourishes but preserve destination accuracy, orientation, and basic optimizer events. Single-step mode: one transition must be quick and easy to inspect (target <= ~600 ms at 1x).

### 11. Orientation
Forward direction follows the rendered velocity / displacement vector. Use quaternion slerp with angular speed limits; avoid instant rotation unless the species behavior calls for it (e.g. a quick head snap). When nearly stationary, retain last heading.

### 12. Terrain Relationship
The optimization terrain is NOT physical collision geometry controlling the algorithm.
Low crawler. Legs contact the rendered terrain; body hugs the surface with gentle normal alignment (clamp +-15 degrees). No pathfinding. X/Z always come from the optimizer.
Surface offset: Minimal clearance; legs on terrain.

### 13. Role States
Use subtle differentiation of the SAME species (posture, small scale delta within +-5%, small accent). Never separate models per role.
- **archive entry**: Archive marker (small mound disc) with rank intensity.
- **sampling ant**: Ant crawls from the archive marker toward the sampled solution (exact destination).
Algorithm role and UI state are separate semantic layers: a role leader is not automatically the selected agent, and not automatically the generic best state.

### 14. Best / Selected States
- Current best candidate: Current Best accent from the common system, adapted to this species (e.g. perch/stance + glyph above the head).
- Selected agent: Selected accent only. It must not be confused with algorithmic importance.
- Both can co-exist; they must be visually separable.
- Infeasible: dashed ring + desaturation + small warning glyph.

### 15. Event-to-Animation Mapping
Brief, informative responses (<= ~400 ms at 1x, trimmed at higher speeds).
- **archive-updated**: Mound markers re-rank with soft fade.
- **sample-generated**: Ant dispatches from the chosen archive entry.
- **kernel-shown**: Gaussian ring shown around chosen archive entry on demand.

### 16. Required Animation Clips
Core set: Idle, Move, Fast Move, Turn, Arrival, Selected, Best Candidate, Role Change. Species clip list:
- Idle_Antennae
- Crawl
- Crawl_Fast
- Turn
- Arrival_Settle
- Selected_Alert
- BestCandidate_Hold
- ArchiveMarker_Pulse
Transition rules: crossfade 120-250 ms; transitions are driven only by optimizer events, displacement, velocity, and role changes, never by random logic. Add phase offsets per individual to avoid lock-step motion. Idle is the fallback.

### 17. Group Behavior
Population reads as archive markers plus moving ants; ants do not follow classic discrete graph paths.
Never introduce boids/flocking or any physics that overrides optimizer coordinates. Mentally test readability at 5, 30 and 50 animals; 30 individuals must remain distinguishable and must not become visual noise (limit simultaneous accents, effects and shadows).

### 18. Scientific Visual Cues
Archive markers with rank-weighted intensity; kernel rings; faint pheromone-like halo = archive weight, not a path trail.
Cues are scientific visualization layers, not decorative particles; every cue must be toggleable. No magic particles, sparks, fire, lightning or fantasy aura.

### 19. LOD & Performance
- Near: full model, full rig, role accents, facial/limb detail.
- Medium: reduced geometry, reduced bone count, simplified cues.
- Far: silhouette-first. Far: archive markers dominate; ant is a 3-ellipsoid mesh. Shadows degrade with LOD; no heavy animation on tiny agents.
- Populations of 20/30/50/100 must run on typical hardware. Use shared materials, GPU instancing where practical, skeletal animation reuse (shared rig + clip retargeting), lightweight shaders, instance-color tinting, minimal draw calls. Restrained shadows with no overwhelming dark patches.

### 20. Accessibility / Reduced Motion
Under `prefers-reduced-motion`: shorter transitions, fewer arcs/flourishes, no additive flourish clips, direct smooth interpolation. Scientific state (role, best, selected, events) must remain understandable through static accents.

### 21. Prohibited Design Choices
- No clothes, backpacks, helmets, tools, weapons, human gestures or speech bubbles.
- No giant mascot eyes, human facial emotion, or glowing sci-fi eyes; express through posture, head direction, locomotion.
- No toy/cartoon proportions; no photoreal documentary rendering; keep the same stylization level as all METAZOO species.
- No changing optimizer destinations, no extra logical waypoints, no treating altitude/arc as optimization dimensions.
- Do not depict ant trails on graph edges; this is continuous ACOR.

### 22. Acceptance Criteria
The prompt is satisfied only if the resulting design answers: (1) what the species looks like; (2) how big it appears; (3) how it moves; (4) how it differs from other METAZOO species; (5) which optimizer states it communicates; (6) which animations are required; (7) what current best looks like; (8) what role changes look like; (9) short vs long movement; (10) how performance stays acceptable for a population; (11) what must never change because mathematics owns movement; (12) what scientific and visual QA applies.

QA checklist: species recognition; optimizer-state readability; distance readability (near/overview/top-oblique); no interference with terrain science; exact destination accuracy; consistent METAZOO style.

### 23. Required Deliverables
1. Character Concept: front, side, top silhouette descriptions/sketches; distinguishing anatomy.
2. 3D Model Direction: target proportions, geometry budget by LOD, material breakdown, rig requirements.
3. Animation List: clips, looping states, event states, transition graph.
4. Optimizer-State Mapping table: state -> visual state, event -> visual event.
5. Performance Strategy: LOD, instancing/skinning considerations.
6. QA plan covering the checklist above.
