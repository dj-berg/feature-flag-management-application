const { useMemo } = React;
const { FeatureFlagsProvider, useFeatureFlags } = window.ConsumerSdk.React;

const FEATURE_CARDS = [
  {
    id: "instant-transfers",
    title: "Instant Transfers",
    description: "Move money in near real time between eligible accounts.",
    button: "Transfer Now",
  },
  {
    id: "mobile-check-deposit",
    title: "Mobile Check Deposit",
    description: "Deposit checks from your phone with image capture.",
    button: "Deposit Check",
  },
  {
    id: "credit-score-dashboard",
    title: "Credit Score Dashboard",
    description: "Track score trends and monitor key credit factors.",
    button: "View Score",
  },
  {
    id: "spending-insights",
    title: "Spending Insights",
    description: "See category spend trends and monthly summaries.",
    button: "View Insights",
  },
  {
    id: "fraud-alerts",
    title: "Fraud Alerts",
    description: "Get notified quickly when unusual activity is detected.",
    button: "Manage Alerts",
  },
  {
    id: "virtual-card",
    title: "Virtual Card",
    description: "Create a card number for safer online transactions.",
    button: "Create Card",
  },
  {
    id: "cash-back-offers",
    title: "Cash Back Offers",
    description: "Unlock targeted offers at participating merchants.",
    button: "Browse Offers",
  },
  {
    id: "travel-notifications",
    title: "Travel Notifications",
    description: "Set travel plans to reduce card disruptions abroad.",
    button: "Set Travel Notice",
  },
];

function App() {
  const { flags, isEnabled } = useFeatureFlags();

  const visibilityByCard = useMemo(() => {
    return FEATURE_CARDS.reduce((acc, card) => {
      acc[card.id] = isEnabled(card.id);
      return acc;
    }, {});
  }, [flags, isEnabled]);

  return (
    <div className="page">
      <header className="navbar">
        <div className="logo">
          <span className="capital">Capital</span>
          <span className="none">None</span>
        </div>

        <nav>
          <a href="#">Home</a>
          <a href="#">Accounts</a>
          <a href="#">Transfer</a>
          <a href="#">Pay Bills</a>
          <a href="#">More</a>
        </nav>

        <div className="profile">JD</div>
      </header>

      <section className="hero">
        <div>
          <h1>Good morning, Jordan.</h1>

          <p>Banking with almost complete confidence.</p>
        </div>

        <button>Move Money... Probably</button>
      </section>

      <section>
        <h2>Accounts</h2>

        <div className="accounts">
          <article className="account checking">
            <h3>Checking</h3>

            <p>•••• 1234</p>

            <h2>$2,342.61</h2>

            <small>Available balance</small>

            <a href="#">View (almost) details →</a>
          </article>

          <article className="account savings">
            <h3>Savings</h3>

            <p>•••• 5678</p>

            <h2>$10,845.23</h2>

            <small>Available balance</small>

            <a href="#">View (almost) details →</a>
          </article>

          <article className="account credit">
            <h3>Credit Card</h3>

            <p>•••• 9101</p>

            <h2>$1,234.56</h2>

            <small>Available credit $5,765.44</small>

            <a href="#">View (almost) details →</a>
          </article>
        </div>
      </section>

      <section>
        <h2>Maybe Useful Features</h2>

        <div className="feature-grid">
          {FEATURE_CARDS.map((card) => (
            <article
              key={card.id}
              id={card.id}
              className="feature-card"
              style={{ display: visibilityByCard[card.id] ? "block" : "none" }}
            >
              <h3>{card.title}</h3>

              <p>{card.description}</p>

              <button>{card.button}</button>
            </article>
          ))}
        </div>
      </section>

      <section className="announcement">
        <div>
          <h3>😎 Good News!</h3>

          <p>Your balance is still positive. For now.</p>
        </div>

        <button>Sweet.</button>
      </section>

      <footer>
        <p>© 2026 Capital None</p>

        <small>Member FDI... never mind.</small>
      </footer>
    </div>
  );
}

const config = window.__APP_CONFIG__ || {};
ReactDOM.createRoot(document.getElementById("root")).render(
  <FeatureFlagsProvider clientId={config.clientId} clientSecret={config.clientSecret}>
    <App />
  </FeatureFlagsProvider>
);
