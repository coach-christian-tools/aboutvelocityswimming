# Evidence-backed imports

Import is a reviewed write interface; shared data viewers are read-only. The fresh workflow requires ImportBatch v2, a matching explicit project/`velocity-v2` target, immutable archived source revisions and field-scoped supporting evidence. Version 1 and batches for another target are rejected.

See [the fresh dataset model, tools and release sequence](FRESH-DATASET.md). [The batch example](import-batch.example.json) is synthetic and cannot apply until its source/check/revision exist in the selected database.

Preview performs reads only. No rows are preselected. Select up to 25 additions, changes or unchanged checks; dependencies, target facts and archived evidence are checked again during the atomic apply transaction. Coaching notes and protected fields cannot be imported. Apply commits facts, private provenance, safe public profiles and before/after receipts consistently. Best-time rebuilding has a durable recovery flag and expiring shared lease. The stored Records, Goals and Film Sessions collections are retired; imports never read or recreate them. Team records will be calculated directly from swims.

Unchanged checked rows preserve fact-change dates and do not rebuild projections. Repeated selections recover through receipts. Changed/ambiguous observations remain visible; a coach can acknowledge held review items without altering business facts. HTML inspection uses inert parsing and text extraction; source HTML is never rendered as executable page markup.

Reopening a batch loads private receipts and pending projection recovery. Guarded reversal checks both current facts and accepted evidence before restoring earlier values. Later edits or checks prevent reversal. It keeps captures and evidence events. New non-race entities cannot be deleted by reversal because they may have acquired references; new races and existing record updates can be reversed. Admin viewers offer no deletion controls.

Legacy maintenance scripts are retained for the original database and require explicit project/database targets plus matching apply confirmations. They reject the fresh database. The prior assistant-history retirement and ownership backfill remain historical operations; no historical evidence is freshly verified or imported here.
