-- Data only. The starter address support@example.com was printed on customers' invoices. A site that never set its own
-- support email shows none until the owner enters it in general settings. An address the owner entered is left alone.
UPDATE "Setting" SET "value" = '' WHERE "key" = 'supportEmail' AND "value" = 'support@example.com';
