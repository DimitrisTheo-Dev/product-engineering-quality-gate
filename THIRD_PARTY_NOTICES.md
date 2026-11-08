# Third-party notices

This repository's original workflow, scripts, tests, and documentation are MIT licensed. Tools are installed from their own distributions or executed as optional commands; their code is not vendored here. Dependency licenses and notices still apply to their distributions.

- Oxfmt/Oxlint (Oxc), Fallow, TypeScript, React, YAML, Corepack, actionlint, Gitleaks, and official GitHub actions publish their own open-source licenses. Playwright is Apache-2.0. Inspect package/release license files when upgrading; a lockfile includes transitive dependencies with their own notices.
- **React Doctor 0.9.22 has a modified MIT license with additional restrictions.** Its official license permits ordinary project/pipeline use, but restricts AI/ML training, evaluation-data uses, and automated collection for improving AI systems. It is therefore optional, installed only with explicit selection, and retains its own terms. This project does not relicense it under MIT or treat it as a dependency of the synthetic live-model evaluation. Read the [full pinned license](https://github.com/millionco/react-doctor/blob/v0.9.22/LICENSE) and [official license guide](https://www.react.doctor/docs/legal/license) for your use case.
- OpenAI API calls, if explicitly enabled, are governed by the provider's terms and billing. They are not included in the free deterministic gate or the fixture tests.

No proprietary source, internal URLs, company datasets, interview material, real customer documents, or provider response transcripts are included in the examples.
