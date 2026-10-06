# Unified Identity Contract

## Absolute invariant
There is one canonical MoboCom human account identity.

Canonical ownership:
- UserId
- credentials/auth providers
- sessions
- devices
- MFA/recovery
- account state
- security/privacy baseline

Domain extensions reference `UserId`; they do not create new login accounts.

Allowed examples:
- ArtistProfile.userId
- SellerProfile.userId
- CommunityMemberSettings.userId
- MessengerPreferences.userId

Forbidden as parallel account identities:
- MessengerUser
- ForumUser
- MusicUser
- StoreUser

## CRM
CRM Contact and authenticated User are distinct lifecycle concepts.
A Contact can exist without an account. Link with stable `UserId` when appropriate.

## Messenger
Messenger owns conversations/messages/membership/read state/presence, but human members reference canonical `UserId`.

## Compatibility
Identity and session APIs/events are long-lived contracts for:
- web
- mobile
- desktop
- Messenger
- plugins/extensions

Do not casually break them. Use explicit versioning, deprecation and contract gates.

## Module lifecycle
Disabling/uninstalling an optional module must not delete canonical identity.
Data purge is a separate privileged action.
