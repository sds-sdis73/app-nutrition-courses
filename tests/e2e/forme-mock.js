// Tables du module Forme simulées (faux PostgREST en mémoire, voir pg-mock.js) tant que la migration n'est pas appliquée en production.
// Si les tables existent déjà, le scénario n'installe pas ce faux : il tourne contre le vrai Supabase.
const { installPgMock } = require('./pg-mock');

const TABLES = ['forme_profil', 'forme_lieux', 'forme_exercices', 'forme_objectifs', 'forme_semaines', 'forme_seances', 'mensurations'];
const KEYS = { forme_profil: ['member_id'] };

const installFormeMock = (page) => installPgMock(page, { tables: TABLES, keys: KEYS });

module.exports = { installFormeMock, TABLES };
