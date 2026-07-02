import assert from 'node:assert/strict';
import { totalCart } from './src/cart.js';

assert.equal(totalCart([{ price: 10, qty: 2 }, { price: 5, qty: 1, discount: 0.2 }]), 24);
