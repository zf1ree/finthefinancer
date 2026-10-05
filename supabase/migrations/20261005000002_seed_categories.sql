-- Fin · árvore de categorias do sistema (user_id null).
-- Grupos e subcategorias em português; slug "grupo" ou "grupo.sub".

alter table public.category no force row level security;

with groups(slug, name, icon, kind, is_essential) as (values
  ('moradia',      'Moradia',              'house',          'expense',    true),
  ('alimentacao',  'Alimentação',          'utensils',       'expense',    true),
  ('transporte',   'Transporte',           'car',            'expense',    true),
  ('saude',        'Saúde',                'heart-pulse',    'expense',    true),
  ('educacao',     'Educação',             'graduation-cap', 'expense',    true),
  ('lazer',        'Lazer',                'party-popper',   'expense',    false),
  ('compras',      'Compras',              'shopping-bag',   'expense',    false),
  ('assinaturas',  'Assinaturas',          'repeat',         'expense',    false),
  ('financeiro',   'Serviços financeiros', 'landmark',       'expense',    false),
  ('impostos',     'Impostos e taxas',     'receipt',        'expense',    true),
  ('outros',       'Outros',               'circle-help',    'expense',    false),
  ('receitas',     'Receitas',             'wallet',         'income',     false),
  ('transferencias','Transferências',      'arrow-left-right','transfer',  false),
  ('investimentos','Investimentos',        'piggy-bank',     'investment', false)
)
insert into public.category (slug, name, icon, kind, is_essential)
select slug, name, icon, kind, is_essential from groups;

with subs(parent, slug, name, icon, is_essential) as (values
  ('moradia',     'moradia.aluguel',            'Aluguel e financiamento', 'key-round',      true),
  ('moradia',     'moradia.condominio',         'Condomínio',              'building',       true),
  ('moradia',     'moradia.contas',             'Luz, água e gás',         'plug',           true),
  ('moradia',     'moradia.internet',           'Internet e telefone',     'wifi',           true),
  ('moradia',     'moradia.manutencao',         'Manutenção e casa',       'hammer',         false),
  ('alimentacao', 'alimentacao.mercado',        'Mercado',                 'shopping-cart',  true),
  ('alimentacao', 'alimentacao.restaurantes',   'Restaurantes',            'utensils-crossed', false),
  ('alimentacao', 'alimentacao.delivery',       'Delivery',                'bike',           false),
  ('alimentacao', 'alimentacao.cafes',          'Cafés e lanches',         'coffee',         false),
  ('transporte',  'transporte.app',             'Transporte por app',      'car-taxi-front', false),
  ('transporte',  'transporte.combustivel',     'Combustível',             'fuel',           true),
  ('transporte',  'transporte.publico',         'Transporte público',      'bus',            true),
  ('transporte',  'transporte.estacionamento',  'Estacionamento e pedágio','square-parking', false),
  ('transporte',  'transporte.veiculo',         'Manutenção do veículo',   'wrench',         true),
  ('saude',       'saude.farmacia',             'Farmácia',                'pill',           true),
  ('saude',       'saude.plano',                'Plano de saúde',          'shield-plus',    true),
  ('saude',       'saude.consultas',            'Consultas e exames',      'stethoscope',    true),
  ('saude',       'saude.academia',             'Academia e esportes',     'dumbbell',       false),
  ('educacao',    'educacao.cursos',            'Cursos e faculdade',      'book-open',      true),
  ('educacao',    'educacao.livros',            'Livros e material',       'book',           false),
  ('lazer',       'lazer.viagens',              'Viagens',                 'plane',          false),
  ('lazer',       'lazer.eventos',              'Shows e eventos',         'ticket',         false),
  ('lazer',       'lazer.bares',                'Bares e saídas',          'beer',           false),
  ('lazer',       'lazer.jogos',                'Jogos e hobbies',         'gamepad-2',      false),
  ('compras',     'compras.online',             'Compras online',          'package',        false),
  ('compras',     'compras.roupas',             'Roupas e acessórios',     'shirt',          false),
  ('compras',     'compras.eletronicos',        'Eletrônicos',             'smartphone',     false),
  ('compras',     'compras.presentes',          'Presentes',               'gift',           false),
  ('compras',     'compras.pets',               'Pets',                    'paw-print',      false),
  ('compras',     'compras.cuidados',           'Cuidados pessoais',       'sparkles',       false),
  ('assinaturas', 'assinaturas.streaming',      'Streaming',               'tv',             false),
  ('assinaturas', 'assinaturas.software',       'Apps e software',         'app-window',     false),
  ('financeiro',  'financeiro.tarifas',         'Tarifas bancárias',       'badge-dollar-sign', false),
  ('financeiro',  'financeiro.juros',           'Juros e multas',          'percent',        false),
  ('financeiro',  'financeiro.emprestimo',      'Parcelas de empréstimo',  'hand-coins',     true),
  ('financeiro',  'financeiro.seguros',         'Seguros',                 'shield',         true),
  ('impostos',    'impostos.tributos',          'Impostos',                'scale',          true),
  ('receitas',    'receitas.salario',           'Salário',                 'briefcase',      false),
  ('receitas',    'receitas.extra',             'Renda extra',             'plus-circle',    false),
  ('receitas',    'receitas.reembolso',         'Reembolsos e estornos',   'undo-2',         false),
  ('receitas',    'receitas.rendimentos',       'Rendimentos',             'trending-up',    false),
  ('transferencias','transferencias.proprias',  'Entre minhas contas',     'arrow-left-right', false),
  ('transferencias','transferencias.fatura',    'Pagamento de fatura',     'credit-card',    false),
  ('transferencias','transferencias.pessoas',   'Para outras pessoas',     'users',          false),
  ('investimentos','investimentos.aplicacao',   'Aplicação',               'piggy-bank',     false),
  ('investimentos','investimentos.resgate',     'Resgate',                 'banknote',       false)
)
insert into public.category (parent_id, slug, name, icon, kind, is_essential)
select g.id, s.slug, s.name, s.icon, g.kind, s.is_essential
from subs s
join public.category g on g.slug = s.parent and g.user_id is null;

alter table public.category force row level security;
