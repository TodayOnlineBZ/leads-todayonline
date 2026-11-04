export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top gutter"><div className="inner wide">
        <img className="brand-logo" src="/logo.png" alt="TodayOnline" width="660" height="132" />
        <h1>Leadsysteem</h1>
        <p>Kwalificeer prospects tijdens het bellen. Elke lead komt onder de ingelogde salesmedewerker te staan.</p>
      </div></header>
      <div className="gutter"><div className="login">{children}</div></div>
    </>
  );
}
