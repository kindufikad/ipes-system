-- Add Lab Assistant evaluation dispatch support
-- Adds fields to track lab assistant evaluations (ARA_STUDENT_FORM, ARA_PEER_FORM)

ALTER TABLE evaluation_dispatches
ADD COLUMN IF NOT EXISTS target_type VARCHAR(32) DEFAULT NULL COMMENT 'Type of target: student, lab_assistant, etc.',
ADD COLUMN IF NOT EXISTS target_user_id INT UNSIGNED DEFAULT NULL COMMENT 'ID of the target user (lab_assistant_id or similar)',
ADD COLUMN IF NOT EXISTS target_first_name VARCHAR(100) DEFAULT NULL COMMENT 'First name of target (for lab assistants)',
ADD COLUMN IF NOT EXISTS target_last_name VARCHAR(100) DEFAULT NULL COMMENT 'Last name of target (for lab assistants)',
ADD COLUMN IF NOT EXISTS target_employee_id VARCHAR(64) DEFAULT NULL COMMENT 'Employee ID of target (for lab assistants)',
ADD COLUMN IF NOT EXISTS evaluation_template VARCHAR(32) DEFAULT NULL COMMENT 'Template type: ARA_STUDENT_FORM, ARA_PEER_FORM, etc.';

-- Add index for efficient queries on lab assistant evaluations
CREATE INDEX IF NOT EXISTS idx_evaluation_dispatches_target_type 
ON evaluation_dispatches(target_type, target_user_id, academic_year, semester);

CREATE INDEX IF NOT EXISTS idx_evaluation_dispatches_template
ON evaluation_dispatches(evaluation_template, status, academic_year, semester);
