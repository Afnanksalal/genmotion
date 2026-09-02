# Native milestones example

This four-second, asset-free project exercises five interoperable native systems in one render: reusable compositions, typed parameters and variants, measured SVG path drawing and following, first-class captions, and independently timed transition presentation.

```bash
genmotion validate examples/native-milestones --strict
genmotion frame examples/native-milestones --at 1 --output examples/native-milestones/frame.png
genmotion render examples/native-milestones --output examples/native-milestones/master.mp4 --quality high
genmotion render-variants examples/native-milestones --output examples/native-milestones/renders --quality draft
```

The project has no remote assets and uses only the native Creative IR renderer.
