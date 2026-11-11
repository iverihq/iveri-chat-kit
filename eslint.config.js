import { react } from '@iveri/eslint-config';

export default [...react, { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } }];
