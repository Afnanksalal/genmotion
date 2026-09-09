# Provider-neutral media resolution

`MediaResolver` is the common job boundary for image, video, audio, voice, SFX, icon and logo search, resolution, import and generation. Providers declare supported operations and return either bounded search candidates or a frozen local delivery. The resolver records complete/failed/cancelled job state and routes accepted files through the project media ledger.

Ledger provenance includes the chosen source, license and attribution evidence, user intent, prompt, settings, provider, model, tool and final local content hash. Generated outputs, captured remote evidence and local imports receive different origins. A logo resolve is rejected unless the provider confirms the source identity; unknown providers and unsupported operations return visible failed jobs. Provider execution is explicit and no background acquisition occurs during rendering.
