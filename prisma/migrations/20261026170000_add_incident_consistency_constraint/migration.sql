-- Add resolution consistency check constraint on incidents table
-- Guarantees that open incidents (isResolved = false) cannot have a resolvedAt timestamp,
-- and resolved incidents (isResolved = true) must have a non-null resolvedAt timestamp >= startedAt.
ALTER TABLE "incidents" ADD CONSTRAINT "check_incident_resolution_consistency"
CHECK (("isResolved" = false AND "resolvedAt" IS NULL) OR ("isResolved" = true AND "resolvedAt" IS NOT NULL AND "resolvedAt" >= "startedAt"));
