export function setInventoryVisible(visible: boolean) {
  const inventory = document.getElementById("inventory");
  if (!inventory) return;
  inventory.style.display = visible ? "flex" : "none";
}
