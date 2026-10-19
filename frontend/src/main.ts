const status = document.querySelector<HTMLParagraphElement>("#status");

async function loadHealth() {
  const response = await fetch("/api/health");
  const data = (await response.json()) as { message: string };

  if (status) {
    status.textContent = data.message;
  }
}

loadHealth().catch(() => {
  if (status) {
    status.textContent = "Backend is not reachable";
  }
});
