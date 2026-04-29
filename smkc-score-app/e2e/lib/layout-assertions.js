function assertStackedCardBoxes(boxes, label) {
  if (boxes.length < 2) {
    throw new Error(`expected at least 2 ${label} cards, got ${boxes.length}`);
  }

  const stacked = boxes.every((box, index) => index === 0 || box.y > boxes[index - 1].y + 1);
  if (!stacked) {
    throw new Error(`${label} cards are not stacked on mobile`);
  }
}

module.exports = {
  assertStackedCardBoxes,
};
