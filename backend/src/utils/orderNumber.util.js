function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function randSuffix(n = 5) {
  const min = 10 ** (n - 1);
  return String(Math.floor(min + Math.random() * (9 * min)));
}

export function generateKitOrderNumber() {
  return `KIT-${dateStamp()}-${randSuffix(5)}`;
}

export function generateBookingNumber() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

export function generateDriverId() {
  return `d${Math.floor(1000 + Math.random() * 9000)}`;
}

export function generateUserId() {
  return `u${Math.floor(1000 + Math.random() * 9000)}`;
}
