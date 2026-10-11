---
'@zapo-js/voip': patch
---

Name in our `<relaylatency>` only the relays that answered our media.

Every relay we dial was named, including one our network never reaches. A peer that measured that relay as its fastest elected it and none of its media reached us. A relay is now named once it first answers a leg, each once per call, so a relay that never answers is never named. A remote media host older than this release reports no answers, so once its media is up every relay we dial is named, as before. The callee dials only on accept, so it still names nothing while it rings.
