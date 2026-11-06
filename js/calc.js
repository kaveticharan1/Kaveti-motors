// Money maths for the cost sheet. All amounts are whole rupees.
import { CONFIG } from '../config.js';

const DAY = 86400000;

// Today's date as YYYY-MM-DD in the phone's own time zone (not UTC).
export const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function daysBetween(fromISO, to = new Date()) {
  const from = new Date(fromISO + 'T00:00:00');
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((end - from) / DAY));
}

// costs = { buy_price, loan_amount, interest_rate, bought_on }, expenses = [{amount}]
export function costSheet(car, costs, expenses = []) {
  const c = costs || { buy_price: 0, loan_amount: 0, interest_rate: 0, bought_on: car.listed_on };
  const days = daysBetween(c.bought_on || car.listed_on);
  const perDay = (c.loan_amount * c.interest_rate) / 100 / 365;
  const interest = perDay * days;
  const spent = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const total = c.buy_price + spent + interest;
  return {
    days,
    perDay,
    interest,
    spent,
    total,                       // no-loss price
    profit: car.price - total,   // profit at asking price
    age: days < CONFIG.amberAfter ? 'g' : days <= CONFIG.redAfter ? 'a' : 'r',
  };
}

export const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
export const lakh = (n) => '₹' + (n / 100000).toFixed(2) + ' L';
export const kmFmt = (n) => Number(n).toLocaleString('en-IN');
