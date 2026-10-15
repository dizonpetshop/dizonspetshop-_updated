# Customer authentication layout

Login, Create Account and Forgot Password share `ClientAuthLayout.tsx`: navy scene with cyan glow, original transparent Dizon logo, decorative illustrated dogs, pale form cards and turquoise buttons. Layout stacks on small screens. Focus indicators, labels, password visibility, errors and recovery stages remain available. Existing API endpoints, authentication, first name/surname/phone registration requirements and code-based password recovery are preserved. No database changes.

Files: `src/components/ClientAuthLayout.tsx`, the three `src/app/client/{login,register,forgot-password}/page.tsx` pages, `src/app/globals.css`, and `public/assets/auth-dogs.png`.

The transparent illustration is saved at `public/assets/auth-dogs.png`. Generated with the built-in imagegen tool; the existing Dizon logo was preserved.

Generation prompt:

Create a website illustration asset, transparent background, wide landscape composition about 2.2:1. Five friendly clean cartoon dogs sitting together facing camera in a row, full bodies including paws completely visible, no cropped ears or tails: small fluffy white terrier, tall seated Dalmatian, cheerful tricolor beagle, elegant seated white-and-brown pit bull, smiling tan-and-white corgi. Match a polished hand-drawn children's pet grooming brand illustration with dark clean outlines and softly shaded pastel fur. All dogs align on the same invisible baseline. No text, no logo, no furniture, no people, no scenery, no floor shape. Generous transparent margin around silhouettes. This is only the decorative dog group for Dizon pet grooming login, register and forgot password pages; UI and logo will be rendered separately.

Validation: TypeScript and production build passed. The isolated system integration suite is used to verify registration, login, role restrictions, reset verification, session behavior and the existing system. See `SYSTEM_TEST_RESULTS.json` for the final recorded run. No pixel-perfect or automated browser interaction result is claimed.