-- Former customers, distinct from current customers and lost opportunities.

alter type public.company_kind add value if not exists 'ex_customer';
