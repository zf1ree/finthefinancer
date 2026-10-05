-- Fase 2 · sincronização com o Open Finance
-- Um consentimento por conexão (o Pluggy expõe um por item); permite upsert.
alter table public.consent add constraint consent_connection_unique unique (connection_id);

-- Busca das pendentes que sumiram do provedor dentro da janela de releitura.
create index tx_account_status_date on public.transaction (account_id, status, date);
