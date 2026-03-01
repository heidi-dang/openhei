-- SQL script to re-enable (delete "disabled") entries for Opencode Go models
-- Usage: replace <WORKSPACE_ID> then run with your SQL client, e.g.
--   mysql -u user -p -h host database < enable-opencode-go.sql

-- WARNING: This deletes rows from the `model` table for the given workspace.
-- Make a backup before running.

-- Replace the placeholder below with your workspace id
SET @workspace_id = '<WORKSPACE_ID>';

DELETE FROM `model`
WHERE `workspace_id` = @workspace_id
  AND `model` IN (
    'minimax-m2.5',
    'minimax-m2.5-free',
    'minimax-m2.1',
    'glm-5',
    'glm-5-free',
    'glm-4.7',
    'glm-4.6',
    'kimi-k2.5',
    'kimi-k2.5-free',
    'kimi-k2-thinking',
    'kimi-k2'
  );

-- If you also want to enable any other model ids, add them above.
