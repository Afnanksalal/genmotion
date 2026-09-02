# Animation kernel

An editable six-second native Genmotion project demonstrating the v2.3 animation foundation:

- numeric, color, point, and shortest-angle interpolation;
- measured physical spring timing;
- smooth seeded procedural drift;
- center-origin stagger timing with trail windows;
- parent-child transform inheritance;
- follow, look-at, maintain-distance, and anchor constraints;
- animated Bezier geometry and color without browser rendering.

Open the project in Studio:

```bash
genmotion studio examples/animation-kernel
```

Render it:

```bash
genmotion validate examples/animation-kernel --strict
genmotion render examples/animation-kernel --output examples/animation-kernel/animation-kernel.mp4 --quality high
```
