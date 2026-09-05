firebase.js:29 Cross-Origin-Opener-Policy policy would block the window.closed call.
await in (anonymous)		
loginWithGoogle	@	firebase.js:29
(anonymous)	@	AuthContext.jsx:163
(anonymous)	@	Login.jsx:33
<button>		
(anonymous)	@	Login.jsx:76

[firebase] loginWithGoogle error: FirebaseError: Firebase: Error (auth/popup-closed-by-user).
loginWithGoogle	@	firebase.js:33
await in loginWithGoogle		
(anonymous)	@	AuthContext.jsx:163
(anonymous)	@	Login.jsx:33
<button>		
(anonymous)	@	Login.jsx:76


FirebaseError: Firebase: Error (auth/popup-closed-by-user).
    at createErrorInternal (firebase_auth.js?v=9a096f39:698:37)
    at _createError (firebase_auth.js?v=9a096f39:663:10)
    at firebase_auth.js?v=9a096f39:7085:25
