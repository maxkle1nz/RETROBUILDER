# COSMOPHONIX ATLAS — Prompt KOMPLETUS (IT)

## Versione completa

Progetta da zero COSMOPHONIX ATLAS.

COSMOPHONIX ATLAS deve essere il sistema operativo interno di una casa di produzione musicale italiana con team multidisciplinare e stakeholder esterni.

Contesto reale:
La struttura operativa storica di Cosmophonix ruota già intorno a questi nuclei:
- Artisti
- Progetti e Canzoni
- Appuntamenti
- Depositi

Il nuovo sistema deve evolvere questa logica in una piattaforma moderna architecture-first, con SSOT chiara, workflow operativi reali, audit trail, permessi per ruolo e readiness per handoff in OMX / BU1LDER.

Obiettivo:
Costruire un sistema di gestione completo per una casa di produzione musicale con:
- producer
- beatmaker
- fotografi
- videomaker
- A&R
- artisti
- collaboratori interni
- clienti esterni
- majors
- editori
- label manager

Identità del sistema:
COSMOPHONIX ATLAS non è un semplice CRM.
È un sistema operativo per una casa di produzione musicale.

Tesi centrale:
- ogni artista ha un workspace dedicato
- ogni release / progetto ha un workspace dedicato
- Kosmo è l’assistente interno di coordinamento
- Kosmo NON fa lavoro creativo per gli artisti
- Kosmo gestisce il contatto tra artista e Producer
- Kosmo può proporre appuntamenti, ma deve prima confermare con il Producer
- solo dopo la conferma del Producer, Kosmo comunica all’artista se l’appuntamento è confermato o no

Moduli obbligatori:

1. Artisti
- profilo completo artista
- anagrafica
- contatti
- stato relazione
- storico messaggi, demo, provini e richieste
- bisogni specifici dell’artista
- collegamento ai progetti e alle release
- note interne
- documenti e asset collegati

2. Progetti e Canzoni
- progetto
- release
- canzoni / opere
- stato del lavoro
- soggetti coinvolti
- task e checklist
- file collegati
- dipendenze operative

3. Appuntamenti
- richiesta appuntamento
- proposta data/orario
- conferma Producer
- notifica all’artista
- storico conferme/rifiuti
- calendario operativo

4. Depositi
- ISRC
- dati editore
- autori
- split
- metadata di ownership
- publishing info
- readiness legale/amministrativa

5. Form intake artista
- pannello form dedicato
- modulo risposte collegato
- domande molto più dettagliate e spiegate
- ogni domanda deve chiarire cosa serve e perché
- aggiungere domanda obbligatoria: “Hai un editore? Se sì, quale?”
- le risposte devono aggiornare sia il workspace artista sia il workspace progetto/release

6. Sistema ISRC Cosmophonix
- assegnazione
- validazione
- tracciamento
- collegamento al label management
- gestione operativa affidata a Luca Bottoli

7. Catalogo Cosmophonix
- database generale artisti
- database generale release
- database opere/canzoni
- ricerca e filtri
- collegamento a un DB interno futuro

8. Sistema label copy
- dati completi di ogni opera
- crediti:
  - producer
  - mix engineer
  - mastering engineer
  - beatmaker
  - fotografi
  - videomaker
  - performer
  - autori
  - collaboratori
- campi obbligatori
- campi opzionali
- validazione completa prima della distribuzione

9. Sistema diritti / editori / split
- editore
- autori
- split
- ownership metadata
- campi obbligatori per publishing
- gestione dati mancanti o incoerenti

10. Sistema copertine
- specifica obbligatoria: 3000x3000 px, 300 dpi, jpeg
- se il file è più piccolo ma recuperabile: upscale automatico
- se il formato non è jpeg: conversione automatica a jpeg
- se il file è inaccettabile: rifiuto con motivazione chiara
- audit trail del controllo qualità artwork

11. Invio masters alla distribuzione
- Universal: via email
- altri canali: portale ADA, portale The Orchard
- Luca Bottoli decide il portale finale
- registrare decisione, data, stato invio, outcome e log operativo

12. Stakeholder esterni
- major
- editori
- clienti esterni
- label
- stato relazione
- richieste
- consegne
- note operative

13. Dashboard operativa
- demo in attesa
- release bloccate
- metadata incomplete
- artwork da correggere
- appuntamenti da confermare
- distribuzioni pendenti
- task per ruolo

Ruoli da supportare:
- Admin
- Producer
- A&R
- Beatmaker
- Fotografo
- Videomaker
- Collaboratore interno
- Artista
- Cliente esterno
- Label / Major / Editore
- Label manager

Workflow obbligatori:
- demo -> valutazione -> feedback -> appuntamento -> produzione -> metadata -> artwork -> masters -> distribuzione
- intake artista -> aggiornamento workspace -> generazione task
- release readiness gate prima della distribuzione
- appointment request -> producer approval -> artist notification

Stati operativi richiesti:
- demo ricevuta
- in valutazione
- feedback inviato
- appuntamento richiesto
- appuntamento confermato
- in produzione
- waiting assets
- metadata incomplete
- artwork da correggere
- ready for distribution
- distributed
- archived

Requisiti architetturali:
- architecture-first
- moduli chiari
- SSOT esplicita
- contratti di dati per ogni modulo
- acceptance criteria
- error handling
- audit trail
- permessi per ruolo
- superfici user-facing chiaramente identificate
- workflow reali, non solo CRUD

Requisiti di design:
- design premium/editoriale-tech
- ispirazione 21st.dev
- forte gerarchia tipografica
- interfacce pulite
- poca confusione visiva
- CTA chiari
- dashboard orientate all’operatività
- il frontend deve riflettere la truth del backend e la state machine reale

Output richiesto:
1. blueprint completo del sistema
2. moduli con responsabilità chiare
3. ruoli e permessi
4. entità dati principali e relazioni
5. workflow end-to-end
6. superfici user-facing
7. acceptance criteria dei moduli principali
8. error handling
9. readiness per handoff in OMX / BU1LDER

## Versione corta

Progetta COSMOPHONIX ATLAS come sistema operativo di una casa di produzione musicale italiana.

Deve gestire:
- Artisti
- Progetti e Canzoni
- Appuntamenti
- Depositi
- ISRC
- Label copy
- Artwork QA
- Distribuzione masters
- Stakeholder esterni (major, editori, clienti)

Regole chiave:
- workspace per artista
- workspace per release/progetto
- Kosmo coordina il rapporto artista <-> Producer ma non fa lavoro creativo
- appuntamenti sempre confermati prima dal Producer
- intake form dettagliato con domanda obbligatoria sull’editore
- artwork accettato solo se 3000x3000, 300 dpi, jpeg; altrimenti convert/upscale/reject
- Universal via email, ADA/The Orchard via portale, decisione finale di Luca Bottoli
- architecture-first, SSOT, contratti dati, acceptance criteria, error handling, audit trail, ruoli/permessi
- design premium/editoriale-tech ispirato a 21st.dev
- frontend allineato alla state machine e alla truth del backend

Output:
- blueprint completo
- moduli
- ruoli e permessi
- entità dati e relazioni
- workflow end-to-end
- user-facing surfaces
- readiness per OMX / BU1LDER
