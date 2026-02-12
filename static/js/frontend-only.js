(function () {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <header class="nav">
      <div class="container nav-row">
        <div class="brand">GO-SAUNA</div>
        <nav class="menu">
          <a href="#">Home</a>
          <a href="#">Saunas</a>
          <a href="#">Book</a>
          <a href="#">Contact</a>
        </nav>
      </div>
    </header>

    <main class="container">
      <section class="hero">
        <h1>Frontend-only mode is active.</h1>
        <p>
          Server features are disabled so you can work on layout, typography, spacing,
          colors, and interactions locally. Re-enable the server bundle later when you
          are ready to reconnect backend logic.
        </p>
        <div class="cta-row">
          <button class="btn btn-primary" type="button">Book Session</button>
          <button class="btn btn-secondary" type="button">Explore Saunas</button>
        </div>
      </section>

      <section class="cards">
        <article class="card">
          <h3>Infrared Sauna</h3>
          <p>Low heat, deep recovery feel. Great for longer sessions and calm evenings.</p>
        </article>
        <article class="card">
          <h3>Traditional Steam</h3>
          <p>Classic high heat and humidity profile with quick warm-up and reset.</p>
        </article>
        <article class="card">
          <h3>Cold Plunge Pairing</h3>
          <p>Contrast routine for circulation and post-workout decompression.</p>
        </article>
      </section>

      <section class="booking">
        <div class="panel">
          <h3>Mock Booking Form</h3>
          <div class="spacer"></div>
          <div class="row">
            <div>
              <label>Date</label>
              <input type="date" />
            </div>
            <div>
              <label>Time</label>
              <input type="time" />
            </div>
          </div>
          <div class="spacer"></div>
          <div class="row">
            <div>
              <label>Session Length</label>
              <select>
                <option>1 hour</option>
                <option>2 hours</option>
                <option>3 hours</option>
              </select>
            </div>
            <div>
              <label>Guest Count</label>
              <select>
                <option>1 guest</option>
                <option>2 guests</option>
                <option>3 guests</option>
                <option>4 guests</option>
              </select>
            </div>
          </div>
          <div class="spacer"></div>
          <label>Notes</label>
          <textarea placeholder="Special requests"></textarea>
        </div>

        <aside class="panel">
          <h3>Summary</h3>
          <div class="spacer"></div>
          <p class="small">Frontend-only preview data</p>
          <p class="price">$120</p>
          <p class="small">2 hours x $60/hr</p>
          <div class="spacer"></div>
          <button class="btn btn-primary" type="button">Confirm (UI Only)</button>
        </aside>
      </section>
    </main>
  `;
})();
