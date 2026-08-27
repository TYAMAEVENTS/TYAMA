begin;

-- Edge Functions use the platform-managed service role. The public wrapper is
-- SECURITY INVOKER and calls the capability-scoped implementation in private,
-- so the role needs schema traversal in addition to its existing function grant.
grant usage on schema private to service_role;

commit;
