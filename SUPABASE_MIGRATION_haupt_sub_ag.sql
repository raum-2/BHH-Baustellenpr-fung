-- Migration: Hauptauftraggeber (Bauherrenhilfe fix, aus Frontend-Konstante)
--            + Subauftraggeber (zu prüfende Firma, ersetzt altes "Auftraggeber"-Feld)
--            Kunde/Bauherr entfällt – Bauherrenhilfe ist jetzt Hauptauftraggeber.
-- Im SQL-Editor einmalig ausführen.

ALTER TABLE begehungen
  ADD COLUMN IF NOT EXISTS sub_ag_firma     TEXT,
  ADD COLUMN IF NOT EXISTS sub_ag_vertreter TEXT,
  ADD COLUMN IF NOT EXISTS sub_ag_email     TEXT,
  ADD COLUMN IF NOT EXISTS sub_ag_adresse   TEXT;

-- Bestandsdaten übertragen: alter "Auftraggeber" wird zur zu prüfenden Firma
UPDATE begehungen SET
  sub_ag_firma     = COALESCE(sub_ag_firma,     auftraggeber_firma),
  sub_ag_vertreter = COALESCE(sub_ag_vertreter, vertreter_ag),
  sub_ag_email     = COALESCE(sub_ag_email,     auftraggeber_email);

-- Alte Spalten bleiben als Backup erhalten. Nach erfolgreichem Rollout optional:
-- ALTER TABLE begehungen DROP COLUMN auftraggeber_firma;
-- ALTER TABLE begehungen DROP COLUMN auftraggeber_name;
-- ALTER TABLE begehungen DROP COLUMN vertreter_ag;
-- ALTER TABLE begehungen DROP COLUMN auftraggeber_email;
-- ALTER TABLE begehungen DROP COLUMN kunde_name;
-- ALTER TABLE begehungen DROP COLUMN kunde_email;
