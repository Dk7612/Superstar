(() => {
  "use strict";

  const API_URL = "https://superstar-oa7t.onrender.com/api/ai/answer";
  const questionInput = document.getElementById("question");
  const choicesInput = document.getElementById("choices");
  const askButton = document.getElementById("ask");
  const status = document.getElementById("status");
  const result = document.getElementById("result");
  const answer = document.getElementById("answer");
  const explanation = document.getElementById("explanation");
  const confidence = document.getElementById("confidence");

  askButton.addEventListener("click", async () => {
    const question = questionInput.value.trim();
    const choices = choicesInput.value.split("\n").map(value => value.trim()).filter(Boolean);
    if (!question || choices.length < 2) {
      status.textContent = "Enter a question and at least two answer choices.";
      return;
    }
    if (question.length > 1200 || choices.length > 8 || choices.some(choice => choice.length > 200)) {
      status.textContent = "Use a question up to 1,200 characters and 2–8 choices up to 200 characters each.";
      return;
    }

    askButton.disabled = true;
    status.textContent = "Thinking…";
    result.hidden = true;
    try {
      const stored = await new Promise(resolve => chrome.storage.local.get(["superstarSessionToken"], resolve));
      const sessionToken = stored.superstarSessionToken || "";
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sessionToken },
        body: JSON.stringify({ question, choices, quickReply: stored.quickReply !== false }),
        signal: AbortSignal.timeout(25000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI request failed.");
      answer.textContent = data.answer ? "Suggested answer: " + data.answer : "No confident answer";
      explanation.textContent = data.explanation || "No explanation provided.";
      confidence.textContent = "Confidence estimate: " + Math.round((data.confidence || 0) * 100) + "%";
      result.hidden = false;
      status.textContent = "Done. Review the explanation before deciding.";
    } catch (error) {
      status.textContent = error.name === "TimeoutError"
        ? "The request timed out. Try again."
        : (error.message || "Could not contact Superstar. Check your connection.");
    } finally {
      askButton.disabled = false;
    }
  });
})();