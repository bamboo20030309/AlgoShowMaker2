# Deferred `@layout` directive

Status: intentionally deferred until repeated positioning problems in additional draw types justify the syntax.

Revisit this design when tree, graph, or another variable-height renderer needs persistent cross-frame layout, or when repeated `at ... offset(...)` directives become difficult to maintain.

Proposed core behavior:

- `@layout` establishes a persistent default placement for the traced runtime object and follows reference aliases through function calls and recursion.
- Trace Studio per-frame placement overrides `@frame ... at`, which overrides `@layout`, which overrides automatic layout.
- Horizontal and vertical constraints may come from different targets, for example `@layout arr align-x canvas.center below keep gap 40`.
- `@layout arr reset` restores automatic placement.
- Layout resolves from measured SVG bounds before text, arrows, camera fitting, and thumbnails.
- Playback may tween a layout change; Trace Studio dragging remains immediate.

The implemented virtual `keep` target is intended to become one layout anchor. It represents the union of visible retained snapshot bounds and excludes keep arrows and hidden snapshots.
