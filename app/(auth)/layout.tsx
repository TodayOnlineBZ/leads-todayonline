export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top gutter"><div className="inner wide">
        <div className="brand">Today<span>Online</span></div>
        <h1>Leadsysteem</h1>
        <p>Kwalificeer prospects tijdens het bellen. Elke lead komt onder de ingelogde salesmedewerker te staan.</p>
      </div></header>
      <div className="gutter"><div className="login">{children}</div></div>
    </>
  );
}
