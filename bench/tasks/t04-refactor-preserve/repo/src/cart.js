export function totalCart(lines) {
  let total = 0;
  for (const line of lines) {
    total += line.price * line.qty;
    if (line.discount) total -= line.price * line.qty * line.discount;
  }
  return Math.round(total * 100) / 100;
}
