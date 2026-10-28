# Génère plats.json : plats Ciqual 2025 (nettoyés) + plats du quotidien composés à partir d'ingrédients Ciqual.
# Usage : python3 tools/build-plats.py aliments.json plats.json
import json, re, sys, unicodedata

SRC, OUT = sys.argv[1], sys.argv[2]
d = json.load(open(SRC))
F = d['fields']
NK = ['kcal', 'prot', 'gluc', 'suc', 'lip', 'ags', 'fib', 'sel', 'ca', 'fe', 'vitc']
rows = d['aliments']
by_code = {r[F.index('code')]: r for r in rows}
by_name = {r[F.index('nom')]: r for r in rows}
val = lambda r, k: r[F.index(k)]

def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())).strip()

def ing(x):
    r = by_code.get(x) if isinstance(x, int) else by_name.get(x)
    assert r, f'ingrédient introuvable : {x}'
    assert val(r, 'kcal') is not None, f'kcal manquantes : {x}'
    return r

# ---------- plats Ciqual ----------
CATS = {
    'plats composés': 'Plats',
    'sandwichs': 'Sandwichs & burgers',
    'pizzas, tartes et crêpes salées': 'Pizzas, tartes & crêpes',
    'soupes': 'Soupes',
    'salades composées et crudités': 'Salades',
    'feuilletées et autres entrées': 'Entrées & apéro',
    'viennoiseries': 'Viennoiseries',
    'gâteaux et pâtisseries': 'Desserts & pâtisseries',
    'desserts glacés': 'Desserts & pâtisseries',
    'glaces': 'Desserts & pâtisseries',
    'sorbets': 'Desserts & pâtisseries',
}
EXTRA = re.compile(r'cuisin|taboul|gratin|ratatouille|hachis|paella|paëlla|risotto|lasagne|ravioli|salade de|aligot|tartiflette|dauphinois|chili|couscous|cassoulet|choucroute|petit sal', re.I)
EXTRA_GROUPS = {'pâtes, riz et céréales', 'pommes de terre et autres tubercules', 'légumineuses', 'légumes', 'viandes cuites', 'poissons cuits'}
SKIP = re.compile(r'\bcrue?s?\b|à cuire|déshydraté(e)?s?(?! reconstitu)|non reconstitu|pour bébé|infantile|en poudre|\bsec(he)?s?\b', re.I)
CLEAN = [r', préemballée?s? à réchauffer', r', préemballée?s?', r'\s+préemballée?s?$', r', rayon frais', r', rayon ambiant', r', surgelée?s?', r', appertisée?s?', r', égouttée?s?', r' \(aliment moyen\)', r', cuite?s?$', r', prête? à consommer', r', artisanale?s?', r', fait maison', r', non égouttée?s?', r', rôtie?s?/cuite?s? au four', r', reconstituée?s?']

def clean(n):
    for p in CLEAN:
        n = re.sub(p, '', n)
    return re.sub(r'\s+,', ',', n).strip(' ,')

def portion(cat, n):
    k = norm(n)
    if cat == 'Plats':
        if re.search(r'nugget|cordon bleu|escalope|paupiette|boulette|croquette|quenelle|nem|samoussa|accras', k): return 150
        return 300
    if cat == 'Sandwichs & burgers':
        for pat, g in [(r'double', 170), (r'cheeseburger', 120), (r'^hamburger', 110), (r'burger', 150), (r'kebab|grec', 300), (r'croque', 150), (r'hot dog', 130), (r'wrap', 180), (r'focaccia|fougasse', 150)]:
            if re.search(pat, k): return g
        return 200
    if cat == 'Pizzas, tartes & crêpes':
        if re.search(r'pizza|flammekueche|tarte flambee', k): return 250
        if re.search(r'burrito|fajita', k): return 220
        return 150
    if cat == 'Soupes': return 250
    if cat == 'Salades': return 200 if 'salade' in k else 150
    if cat == 'Entrées & apéro':
        if re.search(r'nem|samoussa|accras|mini|bouchee', k): return 60
        return 120
    if cat == 'Viennoiseries':
        for pat, g in [(r'croissant', 60), (r'pain au chocolat|chocolatine', 70), (r'pain aux raisins', 90), (r'chausson', 100), (r'brioche', 50), (r'pain au lait', 35)]:
            if re.search(pat, k): return g
        return 70
    if cat == 'Desserts & pâtisseries':
        if re.search(r'glace|sorbet|crème glacée|creme glacee|cone|batonnet', k): return 100
        if re.search(r'macaron|cookie|madeleine|financier|chouquette', k): return 30
        return 100
    return 250

out, seen = [], {}
for r in rows:
    g, n, kc = val(r, 'groupe'), val(r, 'nom'), val(r, 'kcal')
    cat = CATS.get(g)
    if not cat and g in EXTRA_GROUPS and EXTRA.search(n): cat = 'Plats'
    if not cat or kc is None or SKIP.search(n): continue
    nom = clean(n)
    key = norm(nom)
    home = 'fait maison' in n
    if key in seen:
        i = seen[key]
        if home and not out[i]['home']: out[i] = dict(out[i], code=val(r, 'code'), r=r, home=True)
        continue
    seen[key] = len(out)
    out.append({'nom': nom, 'cat': cat, 'code': val(r, 'code'), 'r': r, 'home': home})

plats = []
for x in out:
    r = x['r']
    plats.append({'id': f"c{x['code']}", 'nom': x['nom'], 'cat': x['cat'], 'portion': portion(x['cat'], x['nom']), 'src': 'ciqual', 'n': {k: val(r, k) for k in NK}})

# ---------- plats du quotidien composés ----------
CAFE = 'Café, non instantané, sans sucres ajoutés, prêt à boire'
CHOCO_CER = 'Céréales pour petit déjeuner chocolatées, non fourrées, enrichies en vitamines et minéraux'
CROQUE = 25547
QUICHE = 'Quiche lorraine, préemballée'
OMELETTE = 'Omelette nature, faite maison'
CONF = 31024
COMPOSES = [
    # Bols et cuisine du monde
    ('Bo bun au bœuf', 'Plats', [(9901, 150), (6211, 100), (20009, 40), (20019, 40), (20031, 30), (20183, 30), (15001, 10), (11194, 20), (17130, 5)]),
    ('Poke bowl au saumon', 'Plats', [(9104, 150), (26036, 100), (13004, 50), (20019, 40), (13025, 40), (20014, 30), (11104, 15), (17400, 5)]),
    ('Poke bowl au poulet', 'Plats', [(9104, 150), (36018, 100), (13004, 50), (20066, 40), (20019, 40), (20009, 30), (11104, 15), (17400, 5)]),
    ('Buddha bowl végétarien', 'Plats', [(9341, 120), (20532, 80), (4102, 100), (13004, 50), (20270, 30), (20009, 40), (25621, 30), (17270, 5)]),
    ('Pad thaï aux crevettes', 'Plats', [(9901, 180), (10007, 80), (22502, 50), (20183, 40), (15001, 15), (11104, 15), (17130, 10), (31016, 5)]),
    ('Curry de poulet et riz', 'Plats', [(9104, 180), (36018, 120), (18041, 60), (11132, 50), (20034, 30), (17130, 5)]),
    ('Chili con carne et riz', 'Plats', [(9104, 150), (6255, 100), (20524, 80), (20048, 100), (20034, 30), (17130, 5)]),
    ('Wok de nouilles au poulet et légumes', 'Plats', [(9811, 180), (36018, 100), (20088, 50), (20009, 40), (11104, 15), (17130, 10)]),
    ('Riz cantonais maison', 'Plats', [(9104, 200), (28900, 40), (22502, 50), (20037, 40), (17130, 8)]),
    ('Tofu sauté aux légumes et riz', 'Plats', [(20904, 120), (9104, 150), (20313, 80), (20088, 60), (11104, 15), (17130, 10)]),
    ('Tacos au poulet (2)', 'Sandwichs & burgers', [(7815, 80), (36018, 100), (25620, 40), (20276, 40), (20238, 15), (20031, 15), (12726, 20)]),
    ('Wrap poulet crudités maison', 'Sandwichs & burgers', [(7815, 60), (36018, 80), (20031, 20), (20276, 30), (11054, 15), (12726, 15)]),
    ('Burger maison', 'Sandwichs & burgers', [(7259, 80), (6255, 100), (12726, 20), (20276, 20), (20031, 10), (20034, 10), (11196, 15)]),
    ('Burger maison et frites', 'Sandwichs & burgers', [(7259, 80), (6255, 100), (12726, 20), (20276, 20), (20031, 10), (20034, 10), (11196, 15), (4030, 150)]),
    ('Pita falafels houmous', 'Sandwichs & burgers', [(7180, 80), (25590, 100), (25621, 40), (25604, 20), (20276, 30)]),
    ('Croque-monsieur et salade', 'Sandwichs & burgers', [(CROQUE, 150), (25604, 50), (11110, 10)]),
    # Assiettes françaises
    ('Steak frites', 'Plats', [(6200, 150), (4032, 200), (11008, 15)]),
    ('Poulet rôti et haricots verts', 'Plats', [(36005, 150), (20030, 200), (16400, 5)]),
    ('Poulet rôti et frites', 'Plats', [(36005, 150), (4030, 180)]),
    ('Saumon, riz et courgettes', 'Plats', [(26230, 130), (9104, 150), (20313, 120), (17270, 5)]),
    ('Cabillaud et purée', 'Plats', [(26023, 140), (4040, 200), (16400, 5)]),
    ('Magret de canard et pommes de terre', 'Plats', [(36205, 150), (4026, 200), (17270, 5)]),
    ('Omelette et salade verte', 'Plats', [(OMELETTE, 150), (25604, 60), (11110, 10)]),
    ('Œufs au plat et pain', 'Plats', [(22505, 100), (7001, 50)]),
    ('Purée et jambon', 'Plats', [(4040, 250), (28900, 50)]),
    ('Coquillettes jambon fromage', 'Plats', [(9811, 200), (28900, 50), (12118, 15), (16400, 10)]),
    ('Raclette (repas)', 'Plats', [(4003, 250), (12749, 150), (28800, 40), (28900, 30)]),
    ('Quiche lorraine et salade', 'Pizzas, tartes & crêpes', [(QUICHE, 180), (25604, 60), (11110, 10)]),
    # Pâtes, riz
    ('Pâtes carbonara maison', 'Plats', [(9811, 220), (28725, 50), (19417, 40), (22000, 25), (12120, 10)]),
    ('Pâtes bolognaise maison', 'Plats', [(9811, 220), (6255, 70), (11107, 100), (12120, 8), (17270, 5)]),
    ('Pâtes au pesto', 'Plats', [(9811, 220), (11179, 30), (12120, 8)]),
    ('Pâtes au thon et à la tomate', 'Plats', [(9811, 220), (26039, 60), (11107, 100)]),
    ('Risotto aux champignons', 'Plats', [(9104, 220), (20102, 80), (12120, 15), (16400, 10), (19417, 20), (20034, 20)]),
    ('Gnocchis tomate mozzarella', 'Plats', [(25510, 250), (11107, 100), (19590, 40)]),
    # Salades
    ('Salade niçoise', 'Salades', [(20031, 60), (20276, 100), (26039, 60), (22010, 50), (20030, 50), (13186, 15), (4003, 80), (11110, 15)]),
    ('Salade César maison', 'Salades', [(20171, 100), (36018, 100), (12120, 15), (7004, 20), (11054, 15)]),
    ('Salade de quinoa à la feta', 'Salades', [(9341, 120), (12060, 40), (20019, 50), (20172, 60), (13186, 10), (17270, 10)]),
    ('Salade grecque', 'Salades', [(20276, 120), (20019, 100), (12060, 50), (13186, 15), (20238, 15), (17270, 10)]),
    ('Taboulé maison', 'Salades', [(9683, 120), (20276, 60), (20019, 40), (17270, 10)]),
    ('Assiette de crudités', 'Salades', [(20009, 60), (20019, 60), (20276, 80), (20014, 40), (11110, 15)]),
    # Petit-déjeuner
    ('Tartines beurre confiture', 'Petit-déjeuner', [(7001, 80), (16400, 10), (CONF, 30)]),
    ('Tartines beurre confiture et café', 'Petit-déjeuner', [(7001, 80), (16400, 10), (CONF, 30), (CAFE, 150)]),
    ('Bol de céréales et lait', 'Petit-déjeuner', [(32005, 40), (19033, 200)]),
    ('Céréales chocolatées et lait', 'Petit-déjeuner', [(CHOCO_CER, 40), (19033, 200)]),
    ('Porridge à la banane', 'Petit-déjeuner', [(32140, 50), (19033, 200), (13005, 60), (31008, 10)]),
    ('Yaourt, muesli et fruits rouges', 'Petit-déjeuner', [(19593, 125), (32004, 40), (13014, 60), (31008, 10)]),
    ('Pancakes au miel', 'Petit-déjeuner', [(23827, 120), (31008, 20)]),
    ('Œufs brouillés et pain grillé', 'Petit-déjeuner', [(22502, 120), (7004, 50), (16400, 5)]),
    ('Avocado toast à l\'œuf', 'Petit-déjeuner', [(7110, 60), (13004, 70), (22505, 50)]),
    ('Croissant et café', 'Petit-déjeuner', [(7620, 60), (CAFE, 150)]),
    ('Pain au chocolat et jus d\'orange', 'Petit-déjeuner', [(7730, 70), (2070, 200)]),
    ('Petit-déjeuner complet', 'Petit-déjeuner', [(7001, 60), (16400, 10), (CONF, 20), (2070, 150), (19593, 125), (CAFE, 150)]),
    ('Tartine de pâte à tartiner', 'Petit-déjeuner', [(7001, 60), (31032, 20)]),
    ('Chocolat chaud et tartines beurrées', 'Petit-déjeuner', [(18104, 250), (7001, 60), (16400, 10)]),
    ('Smoothie banane fraise', 'Petit-déjeuner', [(13005, 100), (13014, 100), (19593, 100), (19033, 100)]),
    ('Tartine beurre de cacahuète et banane', 'Petit-déjeuner', [(7110, 60), (15202, 20), (13005, 60)]),
    ('Yaourt et fruits frais', 'Petit-déjeuner', [(19593, 150), (13021, 75), (13014, 60)]),
    # Goûter
    ('Pain et chocolat', 'Goûter', [(7001, 50), (31005, 20)]),
    ('Compote et biscuits', 'Goûter', [(13038, 100), (24015, 25)]),
    ('Fruit et yaourt', 'Goûter', [(13039, 150), (19593, 125)]),
    ('Brioche et chocolat chaud', 'Goûter', [(7742, 50), (18104, 200)]),
    ('Banane et poignée d\'amandes', 'Goûter', [(13005, 120), (15000, 20)]),
]
compo_n = 0
for nom, cat, parts in COMPOSES:
    tot = {k: 0.0 for k in NK}
    g = 0
    for code, grams in parts:
        r = ing(code)
        g += grams
        for k in NK: tot[k] += (val(r, k) or 0) * grams / 100
    per100 = {k: round(tot[k] * 100 / g, 2) for k in NK}
    plats.append({'id': f'm{compo_n}', 'nom': nom, 'cat': cat, 'portion': g, 'src': 'compose', 'n': per100})
    compo_n += 1

# ---------- contrôles ----------
bad = []
for p in plats:
    n = p['n']
    kp = (n['kcal'] or 0) * p['portion'] / 100
    est = 4 * (n['prot'] or 0) + 4 * (n['gluc'] or 0) + 9 * (n['lip'] or 0) + 2 * (n['fib'] or 0)
    if not (20 <= kp <= 1600): bad.append(('portion', p['nom'], round(kp)))
    if n['kcal'] and n['prot'] is not None and n['gluc'] is not None and n['lip'] is not None and abs(est - n['kcal']) / n['kcal'] > 0.2 and p['src'] == 'compose':
        bad.append(('macro', p['nom'], n['kcal'], round(est)))
for b in bad: print('ALERTE', b)
cats = {}
for p in plats: cats[p['cat']] = cats.get(p['cat'], 0) + 1
print(len(plats), 'plats', cats, '| composés :', compo_n)
fields = ['id', 'nom', 'cat', 'portion', 'src'] + NK
json.dump({'source': 'Ciqual 2025, Anses (Licence Ouverte Etalab 2.0) ; plats composés calculés à partir des ingrédients Ciqual', 'fields': fields,
           'plats': [[p['id'], p['nom'], p['cat'], p['portion'], p['src']] + [p['n'][k] for k in NK] for p in plats]},
          open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
