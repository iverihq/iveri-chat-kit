import { createRoot } from 'react-dom/client';

import { Gallery } from './Gallery.js';

import './preview.css';

createRoot(document.querySelector('#root')!).render(<Gallery />);
