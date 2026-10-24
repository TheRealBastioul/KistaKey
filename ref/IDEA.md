I want to create a password manager type application. Wear you can share creds, create a enterprise/org collection, and many more.

Currently I have built OrkaVault, and many of the functionality in OrkaVault I want brough into this next web app I build.



What features do I want

Well, let me say what problem I want to solve.

I noticed that Instagram does not allow assigning account admins, so social media managers need to sign in manually with the username / password.

I had an idea,

What if there was a credential manager, where you can share passwords with other users, and the password would get prefilled in a field with a plugin.

The plugin along with the secret key attached to the shared password session, would get activated once a button labeled somthing like "send to plugin" . After it is sent to the plugin, the plugin holds this encrypted password, and when you then click on a field, it will past the decrypted password, and post. We will need to figure out a way to stop the user from copying the redacted password that got put into the field from the plugin.

The reason is, because shared accounts, we do not want the end-user to know the password.

Could you help walk me threw how we would achieve this concept.

the problem we are solving is sharing passwords, without giving the password it is shared with access.

Think my app OrkaVault / mixed with BitWarden, mixed with this new concept that i thought of, there are other features too, but this is the main new original feature i want to try to build.