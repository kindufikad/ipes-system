const waitForImages = () => Promise.all([...document.images].map((image) => {
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  });
}));

export const printDocument = async (className, onComplete = () => {}) => {
  document.body.classList.add(className);
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    document.body.classList.remove(className);
    window.removeEventListener('afterprint', complete);
    onComplete();
  };

  window.addEventListener('afterprint', complete, { once: true });
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages();
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    window.print();
  } catch (error) {
    complete();
    throw error;
  }
};
