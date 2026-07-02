export function countPairs(values, target) {
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i] + values[j] === target) count += 1;
    }
  }
  return count;
}
