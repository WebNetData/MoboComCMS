# CMS + CRM Product Reference

Load this reference when a task affects generic CMS/CRM capabilities.

## CMS capability map

### Content foundation
- Pages
- Navigation/Menu
- Media
- Taxonomy
- Tags
- Content types/model definitions
- Custom fields
- entity relationships
- slugs/routes
- revisions
- audit/history

### Editorial
- draft
- review
- approval
- scheduling
- publish/unpublish/archive
- author/editor roles
- revision compare/restore where valuable

### Builder
- reusable blocks/components
- layout sections
- canonical entity pickers
- responsive settings only where useful
- safe advanced-code permission boundary

### Forms
- form schema
- validation
- submissions
- spam controls
- notifications
- CRM lead/contact mapping when configured
- export
- retention policy

### SEO
- metadata
- canonical
- redirect manager
- sitemap
- breadcrumbs
- OpenGraph
- structured data from real entities

### Generic extensibility
Use typed domain tables for core specialist entities. Use generic content/custom fields for genuinely generic content. Avoid a universal EAV design for everything.

## CRM capability map

### Core records
- Contact
- Organization
- Lead
- Deal/Opportunity
- Pipeline
- Stage

### Activity
- tasks
- notes
- calls/meetings metadata
- reminders
- assignments
- status changes
- timeline references

### Acquisition
- form submissions
- referral/source
- campaigns/source attribution if product requires it
- manual import
- API/integration

### Organization
- tags
- segments
- custom fields
- saved filters/views
- owners/teams

### Automation
Examples:
- new lead → assign owner → create task → notify
- deal stage changed → schedule follow-up
- order completed → attach customer event to CRM timeline

Rules must be auditable and permission-controlled.

### Privacy
CRM may contain sensitive business/customer information.
- strict admin permissions
- field visibility where needed
- public search exclusion
- audit sensitive exports
- retention/deletion policies
- consent/preferences where jurisdiction/product requires it

### Identity linkage
Never require every Contact to have a login.
Never automatically expose CRM data on public user profiles.


## Canonical identity reminder
CRM Contact is separate from authentication Identity. When linked, use stable canonical MoboCom UserId. Future Messenger and social products must not create parallel account identities.
