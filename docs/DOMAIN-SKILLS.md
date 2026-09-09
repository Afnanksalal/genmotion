# Lazy domain and workflow skills

Genmotion ships small skill packages for captions, audio finishing, supplied-reference adaptation and verified delivery under `skills/genmotion/domains`. Each package has a strict `contract.json`, focused `SKILL.md` and executable `example.json`. Contracts list triggers, required capabilities, named inputs and named outputs.

`selectDomainSkills` loads at most the relevant packages for a request, ordered by trigger score. Studio's Codex host attaches selected packages as native skill inputs; Claude and Hermes receive only the selected contract instructions. The complete domain library is never inserted into every turn.

`saveDomainSkillState` atomically records project revision, step status, errors and content hashes. `loadDomainSkillState` resumes that validated state. `executeDomainSkillExample` invokes a package-specific handler and enforces required example outputs, so examples are executable contracts rather than prose snippets.
