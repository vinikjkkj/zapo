---
---

Core (`zapo-js`): **minor** release note. The core is versioned manually because Changesets excludes the workspace root; no optional package is changed.

Add typed interactive and business sends: buttons, native-flow actions, lists, media carousels, Business app forms, PIX payment cards, charges, catalogs, and products. Expose form tokens on send results and parse native-flow, form, button, list, and template replies. Route catalog cards through their catalog_message business node and preserve context on wrapped reply buttons.

Validate top-level interactive button combinations and limits, cap carousels at 100 cards before uploads, and require decimal-string form IDs. Omit video captions from carousel headers. Parse v1/v2 form replies, object labels and unanswered fields while normalizing sensitivity flags.

Route a first cta_catalog action through its matching business envelope and encode empty reply-button headers as EMPTY. Cover menu_options list replies.

Add `client.business.getCatalog` with cursor pagination and `getProduct` with typed prices and media URLs. Authenticate owner catalog reads internally and expose structured catalog errors.
