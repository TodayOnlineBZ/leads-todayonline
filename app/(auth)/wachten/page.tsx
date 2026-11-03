export default function WaitPage() {
  return (
    <div className="panel">
      <span className="eyebrow">Stap 2 van 2</span>
      <h2>Je account wacht op goedkeuring</h2>
      <p>Je e-mailadres is bevestigd. Bart moet je account nog activeren. Tot die tijd kun je geen leads zien of opslaan.</p>
      <form action="/auth/signout" method="post"><button className="btn alt" type="submit">Uitloggen</button></form>
    </div>
  );
}
