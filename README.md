# ISOLA ZERO
Battle royale 3D nel browser (Three.js r160). Gioca: https://filideicristian21-tech.github.io/isola-zero/

v3: 3 eroi selezionabili (Lampo Ferretti, Nonna Rocca, Ago Morelli) con super abilità (G) con modelli rigged e animazioni scheletriche, schermata di scelta con anteprima 3D, cielo HDRI, terreno con texture PBR, pini e rocce 3D, ombre di contatto, SSAO/bloom/FXAA su PC, eventi a ogni fase della tempesta, muro di copertura istantaneo (C), una rinascita per partita, link «Sfida un amico». Crediti in CREDITS.md.

## Multigiocatore (fino a 4 amici)
- Menu → «Crea partita con amici»: crea una stanza con codice e link `?stanza=CODICE`.
- «Invita su WhatsApp», «Copia link» o «Condividi»: chi apre il link entra subito nella stanza, sceglie nome ed eroe.
- Il capo stanza preme «Inizia»; i bot riempiono i posti fino a 16.
- Rete: WebRTC peer-to-peer con PeerJS (incluso in `peerjs.min.js`), server di collegamento gratuito PeerJS, STUN Google e TURN pubblico PeerJS.
- Il capo stanza simula bot e tempesta: deve tenere la pagina aperta e in primo piano. Se esce, la partita finisce.
- Limiti: senza un TURN dedicato, alcune reti mobili molto restrittive possono non collegarsi; il server gratuito PeerJS non ha garanzie di disponibilità.
