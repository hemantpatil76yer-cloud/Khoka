/* Khoka Web Application - Client Engine & Reactive State Controllers */

// ============================================================================
// 1. REACTIVE DATABASE STATE (SIMULATED SUPABASE)
// ============================================================================
const DB = {
  profiles: [
    { id: "p-self", mobile_number: "+919876543210", full_name: "Hemant Sharma", avatar_url: "", rating: 5.0 },
    { id: "p-arjun", mobile_number: "+919988776655", full_name: "Arjun Kumar", avatar_url: "", rating: 4.8 },
    { id: "p-karan", mobile_number: "+919955443322", full_name: "Karan Gupta", avatar_url: "", rating: 4.6 },
    { id: "p-sneha", mobile_number: "+919966332211", full_name: "Sneha Patel", avatar_url: "", rating: 4.9 }
  ],
  listingsSender: [
    {
      id: "ls-1",
      sender_id: "p-karan",
      from_station_code: "NDLS",
      to_station_code: "HWH",
      parcel_title: "Dell XPS Charger & Docs",
      description: "Need charger & urgent legal affidavits shipped safely. High priority.",
      weight_kg: 1.2,
      dimensions_cm: "30x20x5 cm",
      bounty_offered: 450,
      status: "open",
      created_at: new Date()
    },
    {
      id: "ls-2",
      sender_id: "p-sneha",
      from_station_code: "MAS",
      to_station_code: "NDLS",
      parcel_title: "Medicines & Medical Reports",
      description: "Sealed homeopathic medicine box. Non-perishable, has bills attached.",
      weight_kg: 2.5,
      dimensions_cm: "25x15x10 cm",
      bounty_offered: 600,
      status: "open",
      created_at: new Date()
    }
  ],
  listingsTraveler: [
    {
      id: "lt-1",
      traveler_id: "p-arjun",
      train_number: "12302",
      train_name: "Howrah Rajdhani Express",
      departure_date: "2026-05-25",
      from_station_code: "NDLS",
      to_station_code: "HWH",
      coach_number: "A3",
      travel_class: "3A",
      available_capacity_kg: 8.0,
      status: "open",
      created_at: new Date()
    },
    {
      id: "lt-2",
      traveler_id: "p-karan",
      train_number: "12626",
      train_name: "Kerala Express",
      departure_date: "2026-05-26",
      from_station_code: "NDLS",
      to_station_code: "MAS",
      coach_number: "B2",
      travel_class: "3A",
      available_capacity_kg: 15.0,
      status: "open",
      created_at: new Date()
    }
  ],
  chats: [],
  messages: [],
  deals: []
};

// Current Session User
let currentUser = null;
let currentChat = null;
let activePostType = "sender"; // "sender" or "traveler"
let activeFeedTab = "parcels"; // "parcels" or "travelers"
let isDesktopView = false;
let isOnline = true;

// Active Geofence Telemetry State
let telemetryInterval = null;
let activeTrainNumber = null;
let activeDestinationStation = null;
let distanceToGeofence = 45.0; // km
let trainSpeedKmh = 75.0; // km/h
let alarmAudioContext = null;
let alarmOscillator = null;
let alarmGain = null;
let alarmPlaying = false;

// ============================================================================
// 2. APP ROUTING & SCREEN CONTROLLER
// ============================================================================
function navigateTo(screenId) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
  });
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
  }
}

// ============================================================================
// 3. WIDGETS & TELEMETRY ALARM SOUND SYNTHESIZER (WEB AUDIO API)
// ============================================================================
function startAlarmSound() {
  if (alarmPlaying) return;
  try {
    alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create dual-tone siren oscillator
    alarmOscillator = alarmAudioContext.createOscillator();
    alarmGain = alarmAudioContext.createGain();
    
    alarmOscillator.type = "sawtooth";
    alarmOscillator.frequency.setValueAtTime(880, alarmAudioContext.currentTime); // Standard high tone
    
    // Siren frequency sweep animation
    let time = alarmAudioContext.currentTime;
    for (let i = 0; i < 120; i++) {
      alarmOscillator.frequency.setValueAtTime(880, time);
      alarmOscillator.frequency.exponentialRampToValueAtTime(440, time + 0.4);
      time += 0.8;
    }
    
    alarmGain.gain.setValueAtTime(0.5, alarmAudioContext.currentTime);
    
    alarmOscillator.connect(alarmGain);
    alarmGain.connect(alarmAudioContext.destination);
    
    alarmOscillator.start();
    alarmPlaying = true;
  } catch (e) {
    console.error("Audio Context initialization failed: ", e);
  }
  
  // Vibration logic bypasses silence profiles
  if (navigator.vibrate) {
    navigator.vibrate([500, 300, 500, 300, 500, 300]);
    // Set repeating interval
    window.vibrationInterval = setInterval(() => {
      if (alarmPlaying && navigator.vibrate) {
        navigator.vibrate([500, 300, 500, 300]);
      } else {
        clearInterval(window.vibrationInterval);
      }
    }, 2000);
  }
}

function stopAlarmSound() {
  if (alarmPlaying) {
    if (alarmOscillator) {
      try {
        alarmOscillator.stop();
      } catch (err) {}
    }
    if (alarmAudioContext) {
      alarmAudioContext.close();
    }
    alarmPlaying = false;
    if (window.vibrationInterval) {
      clearInterval(window.vibrationInterval);
    }
  }
}

// Proximity Alarm Telemetry Worker
function startTelemetrySim(trainNumber, stationCode) {
  stopTelemetrySim();
  activeTrainNumber = trainNumber;
  activeDestinationStation = stationCode;
  distanceToGeofence = 45.0; // starts far out
  trainSpeedKmh = 75.0;
  
  const bar = document.getElementById("telemetry-bar");
  const dot = document.getElementById("telemetry-dot");
  const text = document.getElementById("telemetry-text");
  const simBtn = document.getElementById("telemetry-sim-btn");
  
  bar.style.display = "flex";
  dot.className = "status-dot active";
  simBtn.style.display = "block";
  
  function update() {
    // 75 km/h is 1.25 km per minute. In simulator, we subtract 1.5km per 3 seconds to keep it fast
    distanceToGeofence = parseFloat((distanceToGeofence - 1.5).toFixed(1));
    if (distanceToGeofence < 0) distanceToGeofence = 0;
    
    let etaMinutes = Math.floor((distanceToGeofence / trainSpeedKmh) * 60);
    let etaSeconds = Math.floor(((distanceToGeofence / trainSpeedKmh) * 3600) % 60);
    
    text.innerText = `GPS Train ${activeTrainNumber} • ETA ${stationCode} is ${etaMinutes}m ${etaSeconds}s (${distanceToGeofence} km)`;
    
    // Check 5-minute geofenced proximity alarm threshold (at 75km/h, 5 mins is 6.25km)
    // To make it easy to trigger, we check if ETA <= 5 minutes (300 seconds)
    let totalEtaSeconds = (etaMinutes * 60) + etaSeconds;
    if (totalEtaSeconds <= 300 && totalEtaSeconds > 0) {
      triggerProximityAlarm();
    }
    
    if (distanceToGeofence <= 0) {
      stopTelemetrySim();
      text.innerText = `Arrived at ${stationCode}. GPS tracking idle.`;
      dot.className = "status-dot";
      simBtn.style.display = "none";
    }
  }
  
  update();
  telemetryInterval = setInterval(update, 3000);
}

function stopTelemetrySim() {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
}

function triggerProximityAlarm() {
  stopTelemetrySim();
  
  // Set alarm text values
  document.getElementById("alarm-station-title").innerText = `Approaching Platform at ${activeDestinationStation} Station`;
  document.getElementById("alarm-train-val").innerText = `${activeTrainNumber} (${getTrainName(activeTrainNumber)})`;
  document.getElementById("alarm-distance-val").innerText = `${distanceToGeofence} km`;
  
  let etaMinutes = Math.floor((distanceToGeofence / trainSpeedKmh) * 60);
  let etaSeconds = Math.floor(((distanceToGeofence / trainSpeedKmh) * 3600) % 60);
  document.getElementById("alarm-eta-val").innerText = `${etaMinutes}m ${etaSeconds}s prior`;
  
  // Show alarm screen overlay
  document.getElementById("alarm-overlay").style.display = "flex";
  
  // Trigger active warning on telemetry dot
  document.getElementById("telemetry-dot").className = "status-dot alarm-triggered";
  document.getElementById("telemetry-text").innerText = `WAKE UP ALERT! ${activeDestinationStation} station boundary reached.`;
  
  // Activate synthesizer siren & browser vibration
  startAlarmSound();
}

function getTrainName(trainNum) {
  const match = DB.listingsTraveler.find(t => t.train_number === trainNum);
  return match ? match.train_name : "Express Train";
}

// ============================================================================
// 4. SCREEN 1 LOGIC: ONBOARDING & AUTHENTICATION
// ============================================================================
function initAuthScreen() {
  const mobileInput = document.getElementById("auth-mobile");
  const sendOtpBtn = document.getElementById("btn-send-otp");
  const otpBoxes = document.querySelectorAll(".otp-box");
  const verifyOtpBtn = document.getElementById("btn-verify-otp");
  
  // Check valid 10 digit number to activate send OTP
  mobileInput.addEventListener("input", (e) => {
    let raw = e.target.value.replace(/\D/g, "");
    e.target.value = raw;
    sendOtpBtn.disabled = raw.length !== 10;
  });
  
  // Click send OTP - simulated Twilio/Infobip Supabase edge action
  sendOtpBtn.addEventListener("click", () => {
    const ph = mobileInput.value;
    sendOtpBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Dispatching WhatsApp OTP...`;
    
    setTimeout(() => {
      // Transition panels
      document.getElementById("auth-phone-panel").style.display = "none";
      document.getElementById("auth-otp-panel").style.display = "block";
      sendOtpBtn.innerHTML = `Get OTP Code <i class="fa-solid fa-arrow-right"></i>`;
      
      // Auto fill mock OTP 4-8-1-5-1-6 for ease of review
      let mockOtp = ["4", "8", "1", "5", "1", "6"];
      otpBoxes.forEach((box, idx) => {
        box.value = mockOtp[idx];
      });
      otpBoxes[0].focus();
    }, 1200);
  });
  
  // Handle OTP digit transitions
  otpBoxes.forEach((box, index) => {
    box.addEventListener("keyup", (e) => {
      if (box.value.length === 1 && index < otpBoxes.length - 1) {
        otpBoxes[index + 1].focus();
      }
      if (e.key === "Backspace" && index > 0) {
        otpBoxes[index - 1].focus();
      }
    });
  });
  
  document.getElementById("btn-back-phone").addEventListener("click", () => {
    document.getElementById("auth-otp-panel").style.display = "none";
    document.getElementById("auth-phone-panel").style.display = "block";
  });
  
  // Verify OTP & complete registration
  verifyOtpBtn.addEventListener("click", () => {
    const nameField = document.getElementById("auth-name");
    if (!nameField.value.trim()) {
      alert("Please provide your Full Name to complete profile setup!");
      nameField.focus();
      return;
    }
    
    verifyOtpBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Initializing Profile...`;
    
    setTimeout(() => {
      const mob = "+91" + mobileInput.value;
      const nm = nameField.value.trim();
      
      // Save session
      currentUser = {
        id: "p-self",
        mobile_number: mob,
        full_name: nm,
        avatar_url: "",
        rating: 5.0
      };
      
      // Add or update in simulated profiles db
      const existing = DB.profiles.find(p => p.id === "p-self");
      if (existing) {
        existing.full_name = nm;
        existing.mobile_number = mob;
      } else {
        DB.profiles.push(currentUser);
      }
      
      // Update visual avatars
      document.getElementById("feed-avatar").innerText = nm.charAt(0).toUpperCase();
      document.getElementById("deal-user-sender").innerText = nm.charAt(0).toUpperCase();
      
      verifyOtpBtn.innerHTML = `Complete Registration <i class="fa-solid fa-circle-check"></i>`;
      
      // Transition to Feed
      navigateTo("screen-feed");
      renderFeedListings();
    }, 1000);
  });
}

// ============================================================================
// 5. SCREEN 2 LOGIC: UNIVERSAL BOARD MATCH FEED
// ============================================================================
function initFeedScreen() {
  const tabParcels = document.getElementById("tab-parcels");
  const tabTravelers = document.getElementById("tab-travelers");
  const searchInput = document.getElementById("filter-search");
  
  tabParcels.addEventListener("click", () => {
    tabParcels.classList.add("active");
    tabTravelers.classList.remove("active");
    activeFeedTab = "parcels";
    renderFeedListings();
  });
  
  tabTravelers.addEventListener("click", () => {
    tabTravelers.classList.add("active");
    tabParcels.classList.remove("active");
    activeFeedTab = "travelers";
    renderFeedListings();
  });
  
  // Filters search box
  searchInput.addEventListener("input", renderFeedListings);
  
  // Chip click filters
  const chips = ["chip-all", "chip-ndls", "chip-hwh", "chip-mas"];
  chips.forEach(chipId => {
    document.getElementById(chipId).addEventListener("click", (e) => {
      chips.forEach(cid => document.getElementById(cid).classList.remove("active"));
      e.currentTarget.classList.add("active");
      renderFeedListings();
    });
  });
  
  // FAB Posting Action
  document.getElementById("fab-post-listing").addEventListener("click", () => {
    navigateTo("screen-post");
    initPostingFormState();
  });
  
  // Logout
  document.getElementById("btn-feed-logout").addEventListener("click", () => {
    currentUser = null;
    document.getElementById("auth-otp-panel").style.display = "none";
    document.getElementById("auth-phone-panel").style.display = "block";
    document.getElementById("auth-mobile").value = "";
    document.getElementById("auth-name").value = "";
    navigateTo("screen-auth");
  });
}

function getActiveFilterRoute() {
  if (document.getElementById("chip-ndls").classList.contains("active")) return "NDLS";
  if (document.getElementById("chip-hwh").classList.contains("active")) return "HWH";
  if (document.getElementById("chip-mas").classList.contains("active")) return "MAS";
  return null;
}

function renderFeedListings() {
  const container = document.getElementById("listings-container");
  container.innerHTML = "";
  
  const searchVal = document.getElementById("filter-search").value.toLowerCase().trim();
  const routeFilter = getActiveFilterRoute();
  
  if (activeFeedTab === "parcels") {
    // Senders listings looking for transport
    let items = DB.listingsSender.filter(item => item.status === "open");
    
    // Apply filters
    if (routeFilter) {
      items = items.filter(item => item.from_station_code === routeFilter);
    }
    if (searchVal) {
      items = items.filter(item => 
        item.parcel_title.toLowerCase().includes(searchVal) ||
        item.from_station_code.toLowerCase().includes(searchVal) ||
        item.to_station_code.toLowerCase().includes(searchVal) ||
        item.description.toLowerCase().includes(searchVal)
      );
    }
    
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <h3>No Active Parcels found</h3>
          <p>Be the first to post a new parcel shipping listing!</p>
        </div>
      `;
      return;
    }
    
    items.forEach(item => {
      const sender = DB.profiles.find(p => p.id === item.sender_id) || { full_name: "Anonymous", rating: 4.5 };
      const tile = document.createElement("div");
      tile.className = "listing-card type-sender";
      tile.innerHTML = `
        <div class="card-top-row">
          <span class="card-route">${item.from_station_code} <i class="fa-solid fa-arrow-right card-route-arrow"></i> ${item.to_station_code}</span>
          <span class="card-bounty">₹${item.bounty_offered}</span>
        </div>
        <div class="card-title">${item.parcel_title}</div>
        <div class="card-details-row">
          <div class="card-detail-item"><i class="fa-solid fa-weight-hanging"></i> ${item.weight_kg} kg</div>
          <div class="card-detail-item"><i class="fa-solid fa-ruler-combined"></i> ${item.dimensions_cm}</div>
        </div>
        <div class="card-user-info">
          <div class="user-badge">
            <div class="user-avatar">${sender.full_name.charAt(0).toUpperCase()}</div>
            <span>${sender.full_name}</span>
          </div>
          <span class="user-rating"><i class="fa-solid fa-star"></i> ${sender.rating.toFixed(1)}</span>
        </div>
      `;
      
      // Click tile opens detail overlay sheet
      tile.addEventListener("click", () => {
        openListingDetailSheet(item, "sender");
      });
      
      container.appendChild(tile);
    });
    
  } else {
    // Travelers with Capacity listings
    let items = DB.listingsTraveler.filter(item => item.status === "open");
    
    // Apply filters
    if (routeFilter) {
      items = items.filter(item => item.from_station_code === routeFilter);
    }
    if (searchVal) {
      items = items.filter(item => 
        item.train_number.includes(searchVal) ||
        item.train_name.toLowerCase().includes(searchVal) ||
        item.from_station_code.toLowerCase().includes(searchVal) ||
        item.to_station_code.toLowerCase().includes(searchVal)
      );
    }
    
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-train"></i>
          <h3>No Active Travelers found</h3>
          <p>Add your upcoming train travel and help ship parcels!</p>
        </div>
      `;
      return;
    }
    
    items.forEach(item => {
      const traveler = DB.profiles.find(p => p.id === item.traveler_id) || { full_name: "Anonymous", rating: 4.5 };
      const tile = document.createElement("div");
      tile.className = "listing-card type-traveler";
      tile.innerHTML = `
        <div class="card-top-row">
          <span class="card-route">${item.from_station_code} <i class="fa-solid fa-arrow-right card-route-arrow"></i> ${item.to_station_code}</span>
          <span class="card-capacity">${item.available_capacity_kg} kg Free</span>
        </div>
        <div class="card-title">Train ${item.train_number} - ${item.train_name}</div>
        <div class="card-details-row">
          <div class="card-detail-item"><i class="fa-solid fa-calendar-day"></i> ${item.departure_date}</div>
          <div class="card-detail-item"><i class="fa-solid fa-ticket"></i> Coach ${item.coach_number} (${item.travel_class})</div>
        </div>
        <div class="card-user-info">
          <div class="user-badge">
            <div class="user-avatar" style="color:var(--color-secondary);">${traveler.full_name.charAt(0).toUpperCase()}</div>
            <span>${traveler.full_name}</span>
          </div>
          <span class="user-rating"><i class="fa-solid fa-star"></i> ${traveler.rating.toFixed(1)}</span>
        </div>
      `;
      
      // Click tile opens detail sheet
      tile.addEventListener("click", () => {
        openListingDetailSheet(item, "traveler");
      });
      
      container.appendChild(tile);
    });
  }
}

// ============================================================================
// MODAL SHEET DETAIL COMPONENT
// ============================================================================
function openListingDetailSheet(item, type) {
  const modal = document.getElementById("detail-modal");
  const content = document.getElementById("detail-sheet-content");
  
  const user = DB.profiles.find(p => p.id === (type === "sender" ? item.sender_id : item.traveler_id)) || { full_name: "Arjun Kumar", rating: 4.8 };
  
  if (type === "sender") {
    content.innerHTML = `
      <div class="modal-drag-handle"></div>
      <div class="detail-header-route">
        <span>${item.from_station_code}</span>
        <i class="fa-solid fa-arrow-right" style="color:var(--color-primary); font-size: 0.95rem;"></i>
        <span>${item.to_station_code}</span>
      </div>
      
      <h3 style="font-family: var(--font-display);">${item.parcel_title}</h3>
      
      <div class="detail-meta-list">
        <div class="detail-meta-item">
          <span class="detail-meta-label">Bounty Offer</span>
          <span class="detail-meta-val" style="color:var(--color-accent); font-weight:700;">₹${item.bounty_offered}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Baggage Weight</span>
          <span class="detail-meta-val">${item.weight_kg} kg</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Structural Dimensions</span>
          <span class="detail-meta-val">${item.dimensions_cm}</span>
        </div>
      </div>
      
      <div class="detail-description">
        <strong>Description:</strong><br>
        ${item.description}
      </div>

      <div class="card-user-info" style="border-top: 1px solid var(--border-color); padding-top: 12px;">
        <div class="user-badge">
          <div class="user-avatar" style="width:36px; height:36px; font-size: 1rem;">${user.full_name.charAt(0).toUpperCase()}</div>
          <div>
            <strong style="display:block; font-size: 0.85rem; color:var(--text-primary);">${user.full_name}</strong>
            <span style="font-size:0.7rem; color:var(--text-muted);">Verified Sender</span>
          </div>
        </div>
        <span class="user-rating" style="font-size:0.95rem;"><i class="fa-solid fa-star"></i> ${user.rating.toFixed(1)}</span>
      </div>

      <div class="detail-action-row">
        <button class="btn-secondary-outline" id="btn-detail-close" style="justify-content:center; padding: 12px;"><i class="fa-solid fa-circle-chevron-down"></i> Close</button>
        <button class="btn-primary" id="btn-detail-chat" style="padding: 12px;"><i class="fa-solid fa-comments"></i> Chat Now</button>
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="modal-drag-handle"></div>
      <div class="detail-header-route">
        <span>${item.from_station_code}</span>
        <i class="fa-solid fa-arrow-right" style="color:var(--color-secondary); font-size: 0.95rem;"></i>
        <span>${item.to_station_code}</span>
      </div>
      
      <h3 style="font-family: var(--font-display);">Train ${item.train_number} • ${item.train_name}</h3>
      
      <div class="detail-meta-list">
        <div class="detail-meta-item">
          <span class="detail-meta-label">Luggage Class</span>
          <span class="detail-meta-val">${item.travel_class}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Baggage Capacity</span>
          <span class="detail-meta-val" style="color:var(--color-secondary); font-weight:700;">${item.available_capacity_kg} kg free</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Departure Date</span>
          <span class="detail-meta-val">${item.departure_date}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Coach Reference</span>
          <span class="detail-meta-val">Coach ${item.coach_number}</span>
        </div>
      </div>
      
      <div class="detail-description">
        <strong>Luggage Terms:</strong><br>
        Traveler booked in Class ${item.travel_class} has unused capacity. Willing to carry legal baggage packages matching the official dimension standards.
      </div>

      <div class="card-user-info" style="border-top: 1px solid var(--border-color); padding-top: 12px;">
        <div class="user-badge">
          <div class="user-avatar" style="width:36px; height:36px; font-size: 1rem; color:var(--color-secondary);">${user.full_name.charAt(0).toUpperCase()}</div>
          <div>
            <strong style="display:block; font-size: 0.85rem; color:var(--text-primary);">${user.full_name}</strong>
            <span style="font-size:0.7rem; color:var(--text-muted);">Verified Traveler</span>
          </div>
        </div>
        <span class="user-rating" style="font-size:0.95rem;"><i class="fa-solid fa-star"></i> ${user.rating.toFixed(1)}</span>
      </div>

      <div class="detail-action-row">
        <button class="btn-secondary-outline" id="btn-detail-close" style="justify-content:center; padding: 12px;"><i class="fa-solid fa-circle-chevron-down"></i> Close</button>
        <button class="btn-primary" id="btn-detail-chat" style="padding: 12px;"><i class="fa-solid fa-comments"></i> Chat Now</button>
      </div>
    `;
  }
  
  modal.classList.add("active");
  
  // Wire sheet button actions
  document.getElementById("btn-detail-close").addEventListener("click", () => {
    modal.classList.remove("active");
  });
  
  document.getElementById("btn-detail-chat").addEventListener("click", () => {
    modal.classList.remove("active");
    initChatThread(item, type, user);
  });
}

// ============================================================================
// 6. SCREEN 3 LOGIC: THE POSTING FORM
// ============================================================================
function initPostingScreen() {
  const tabSender = document.getElementById("post-tab-sender");
  const tabTraveler = document.getElementById("post-tab-traveler");
  
  const senderContainer = document.getElementById("form-sender-container");
  const travelerContainer = document.getElementById("form-traveler-container");
  
  tabSender.addEventListener("click", () => {
    tabSender.classList.add("active");
    tabTraveler.classList.remove("active");
    senderContainer.style.display = "block";
    travelerContainer.style.display = "none";
    activePostType = "sender";
  });
  
  tabTraveler.addEventListener("click", () => {
    tabTraveler.classList.add("active");
    tabSender.classList.remove("active");
    senderContainer.style.display = "none";
    travelerContainer.style.display = "block";
    activePostType = "traveler";
  });
  
  // Dimension select cards
  const dimCards = document.querySelectorAll(".dim-card");
  const customDimWrapper = document.getElementById("custom-dim-wrapper");
  
  dimCards.forEach(card => {
    card.addEventListener("click", (e) => {
      dimCards.forEach(c => c.classList.remove("active"));
      const current = e.currentTarget;
      current.classList.add("active");
      
      const sizeType = current.getAttribute("data-size");
      if (sizeType === "custom") {
        customDimWrapper.style.display = "block";
        document.getElementById("send-dimensions").focus();
      } else {
        customDimWrapper.style.display = "none";
      }
    });
  });
  
  // Baggage Modal overlays
  const modal = document.getElementById("baggage-modal");
  document.getElementById("btn-trigger-baggage-modal").addEventListener("click", () => {
    modal.classList.add("active");
  });
  
  document.getElementById("btn-close-baggage").addEventListener("click", () => {
    modal.classList.remove("active");
  });
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });
  
  // Coach Class Select haptic caution warning trigger
  const classOptions = document.querySelectorAll("#travel-class-select .toggle-option");
  const warningBox = document.getElementById("travel-3a-warning");
  classOptions.forEach(opt => {
    opt.addEventListener("click", (e) => {
      classOptions.forEach(o => o.classList.remove("active"));
      e.currentTarget.classList.add("active");
      const val = e.currentTarget.getAttribute("data-class");
      
      if (val === "3A") {
        warningBox.style.display = "block";
      } else {
        warningBox.style.display = "none";
      }
    });
  });
  
  // Back
  document.getElementById("btn-back-feed").addEventListener("click", () => {
    navigateTo("screen-feed");
  });
  
  // Submit Sender form
  document.getElementById("btn-submit-sender").addEventListener("click", () => {
    const fromVal = document.getElementById("send-from").value.toUpperCase().trim();
    const toVal = document.getElementById("send-to").value.toUpperCase().trim();
    const titleVal = document.getElementById("send-title").value.trim();
    const descVal = document.getElementById("send-desc").value.trim();
    const weightVal = parseFloat(document.getElementById("send-weight").value);
    const bountyVal = parseFloat(document.getElementById("send-bounty").value);
    
    if (!fromVal || !toVal || !titleVal || isNaN(weightVal) || isNaN(bountyVal)) {
      alert("Please complete all required fields!");
      return;
    }
    
    // Read active size card
    const activeCard = document.querySelector(".dim-card.active");
    let size = activeCard.getAttribute("data-dim");
    if (activeCard.getAttribute("data-size") === "custom") {
      size = document.getElementById("send-dimensions").value.trim() || "35x25x10 cm";
    }
    
    // Store in db state
    const newListing = {
      id: "ls-" + (DB.listingsSender.length + 1),
      sender_id: "p-self",
      from_station_code: fromVal,
      to_station_code: toVal,
      parcel_title: titleVal,
      description: descVal || "No additional description.",
      weight_kg: weightVal,
      dimensions_cm: size,
      bounty_offered: bountyVal,
      status: "open",
      created_at: new Date()
    };
    
    DB.listingsSender.unshift(newListing);
    
    // Return to board feed
    activeFeedTab = "parcels";
    document.getElementById("tab-parcels").classList.add("active");
    document.getElementById("tab-travelers").classList.remove("active");
    navigateTo("screen-feed");
    renderFeedListings();
    
    // Clear forms
    document.getElementById("send-from").value = "";
    document.getElementById("send-to").value = "";
    document.getElementById("send-title").value = "";
    document.getElementById("send-desc").value = "";
    document.getElementById("send-weight").value = "";
    document.getElementById("send-bounty").value = "";
  });
  
  // Submit Traveler form
  document.getElementById("btn-submit-traveler").addEventListener("click", () => {
    const trainNum = document.getElementById("travel-train-num").value.trim();
    const trainName = document.getElementById("travel-train-name").value.trim();
    const fromVal = document.getElementById("travel-from").value.toUpperCase().trim();
    const toVal = document.getElementById("travel-to").value.toUpperCase().trim();
    const dateVal = document.getElementById("travel-date").value;
    const capacityVal = parseFloat(document.getElementById("travel-capacity").value);
    const coachVal = document.getElementById("travel-coach").value.toUpperCase().trim();
    
    if (!trainNum || !fromVal || !toVal || !dateVal || isNaN(capacityVal)) {
      alert("Please complete all required fields!");
      return;
    }
    
    // Get class toggle active
    const activeClassOpt = document.querySelector("#travel-class-select .toggle-option.active");
    const classVal = activeClassOpt ? activeClassOpt.getAttribute("data-class") : "3A";
    
    // Store in db state
    const newListing = {
      id: "lt-" + (DB.listingsTraveler.length + 1),
      traveler_id: "p-self",
      train_number: trainNum,
      train_name: trainName || "Express Train",
      departure_date: dateVal,
      from_station_code: fromVal,
      to_station_code: toVal,
      coach_number: coachVal || "Gen",
      travel_class: classVal,
      available_capacity_kg: capacityVal,
      status: "open",
      created_at: new Date()
    };
    
    DB.listingsTraveler.unshift(newListing);
    
    // Return to board feed
    activeFeedTab = "travelers";
    document.getElementById("tab-travelers").classList.add("active");
    document.getElementById("tab-parcels").classList.remove("active");
    navigateTo("screen-feed");
    renderFeedListings();
    
    // Clear forms
    document.getElementById("travel-train-num").value = "";
    document.getElementById("travel-train-name").value = "";
    document.getElementById("travel-from").value = "";
    document.getElementById("travel-to").value = "";
    document.getElementById("travel-date").value = "";
    document.getElementById("travel-capacity").value = "";
    document.getElementById("travel-coach").value = "";
  });
}

function initPostingFormState() {
  // Set date picker tomorrow as default
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];
  document.getElementById("travel-date").value = dateStr;
}

// ============================================================================
// 7. SCREEN 4 LOGIC: REALTIME MULTIMEDIA CHAT
// ============================================================================
function initChatThread(item, type, peerUser) {
  // Create chat entry if none exists
  let chat = DB.chats.find(c => c.listing_id === item.id);
  if (!chat) {
    chat = {
      id: "chat-" + (DB.chats.length + 1),
      listing_id: item.id,
      listing_type: type,
      buyer_id: type === "sender" ? "p-self" : item.traveler_id,
      seller_id: type === "sender" ? item.sender_id : "p-self",
      negotiated_price: type === "sender" ? item.bounty_offered : 500,
      created_at: new Date()
    };
    DB.chats.push(chat);
    
    // Preseed first message welcoming matching context
    DB.messages.push({
      id: "msg-" + (DB.messages.length + 1),
      chat_id: chat.id,
      sender_id: peerUser.id,
      message_type: "text",
      content: `Hello! I noticed your listing on the route ${item.from_station_code} to ${item.to_station_code}. I have matching coordinates. Let's align on dimensions & payout!`,
      created_at: new Date(Date.now() - 60000)
    });
  }
  
  currentChat = chat;
  
  // Set UI Header
  document.getElementById("chat-header-user").innerText = peerUser.full_name;
  
  // Show lock deal button if deal status is not yet locked
  const activeDeal = DB.deals.find(d => d.chat_id === chat.id);
  const banner = document.getElementById("chat-deal-banner");
  const lockTriggerBtn = document.getElementById("btn-lock-deal-trigger");
  
  if (activeDeal) {
    banner.className = "deal-status-banner locked";
    banner.querySelector("span").innerText = `Coordination Structure Locked (Deal Status: ${activeDeal.deal_status.toUpperCase()})`;
    lockTriggerBtn.innerText = "Locked";
    lockTriggerBtn.disabled = true;
    lockTriggerBtn.className = "deal-action-btn locked-state";
  } else {
    banner.className = "deal-status-banner";
    banner.querySelector("span").innerText = "Lock coordination structure & secure courier status";
    lockTriggerBtn.innerText = "Lock Deal";
    lockTriggerBtn.disabled = false;
    lockTriggerBtn.className = "deal-action-btn";
  }
  
  // Navigate
  navigateTo("screen-chat");
  renderChatMessages();
}

function renderChatMessages() {
  const container = document.getElementById("chat-messages-container");
  container.innerHTML = "";
  
  if (!currentChat) return;
  
  const msgs = DB.messages.filter(m => m.chat_id === currentChat.id);
  msgs.forEach(msg => {
    const isSelf = msg.sender_id === "p-self";
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${isSelf ? "sender" : "recipient"}`;
    
    let contentHtml = "";
    
    if (msg.message_type === "image") {
      contentHtml = `
        <div class="chat-media-attachment">
          <img src="${msg.content}" alt="Verification Image">
        </div>
        <span style="display:block; font-size:0.75rem; font-style:italic; opacity:0.8; margin-top:2px;"><i class="fa-solid fa-circle-check" style="color:#25d366;"></i> Package content verified</span>
      `;
    } else if (msg.message_type === "document") {
      contentHtml = `
        <div class="chat-doc-attachment">
          <i class="fa-solid fa-file-pdf"></i>
          <div>
            <strong>Baggage_Receipt.pdf</strong><br>
            <span style="font-size:0.65rem; opacity:0.7;">Official Invoice • 240 KB</span>
          </div>
        </div>
      `;
    } else {
      contentHtml = `<span>${msg.content}</span>`;
    }
    
    const timeStr = msg.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
      ${contentHtml}
      <span class="timestamp">${timeStr}</span>
    `;
    
    container.appendChild(bubble);
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function initChatScreenActions() {
  const input = document.getElementById("chat-input-message");
  const sendBtn = document.getElementById("btn-send-message");
  const cameraBtn = document.getElementById("btn-chat-camera");
  const docBtn = document.getElementById("btn-chat-doc");
  const callBtn = document.getElementById("btn-chat-call");
  
  const sendMessage = () => {
    const text = input.value.trim();
    if (!text || !currentChat) return;
    
    DB.messages.push({
      id: "msg-" + (DB.messages.length + 1),
      chat_id: currentChat.id,
      sender_id: "p-self",
      message_type: "text",
      content: text,
      created_at: new Date()
    });
    
    input.value = "";
    renderChatMessages();
    
    // Simulate smart interactive reply after 2 seconds
    const activeChatId = currentChat.id;
    setTimeout(() => {
      if (currentChat && currentChat.id === activeChatId) {
        // Find matching traveler name
        const peerId = currentChat.seller_id === "p-self" ? currentChat.buyer_id : currentChat.seller_id;
        const peer = DB.profiles.find(p => p.id === peerId) || { full_name: "Arjun Kumar" };
        
        DB.messages.push({
          id: "msg-" + (DB.messages.length + 1),
          chat_id: activeChatId,
          sender_id: peerId,
          message_type: "text",
          content: `Understood! Dimensions check out. Please upload a picture of the package so I can verify security compliance before locking the deal.`,
          created_at: new Date()
        });
        
        renderChatMessages();
      }
    }, 2000);
  };
  
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  
  // Mock validation image upload
  cameraBtn.addEventListener("click", () => {
    if (!currentChat) return;
    
    // Camera shutter animation simulation
    const canvas = document.querySelector(".app-canvas");
    const flash = document.createElement("div");
    flash.style.position = "absolute";
    flash.style.top = "0";
    flash.style.left = "0";
    flash.style.width = "100%";
    flash.style.height = "100%";
    flash.style.background = "#fff";
    flash.style.zIndex = "9999";
    flash.style.opacity = "0.9";
    flash.style.transition = "opacity 0.4s ease";
    canvas.appendChild(flash);
    
    setTimeout(() => { flash.style.opacity = "0"; }, 50);
    setTimeout(() => { flash.remove(); }, 400);
    
    // Append simulated photo
    setTimeout(() => {
      DB.messages.push({
        id: "msg-" + (DB.messages.length + 1),
        chat_id: currentChat.id,
        sender_id: "p-self",
        message_type: "image",
        content: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=300&q=80", // placeholder package picture
        created_at: new Date()
      });
      renderChatMessages();
    }, 500);
  });
  
  // Mock document upload
  docBtn.addEventListener("click", () => {
    if (!currentChat) return;
    setTimeout(() => {
      DB.messages.push({
        id: "msg-" + (DB.messages.length + 1),
        chat_id: currentChat.id,
        sender_id: "p-self",
        message_type: "document",
        content: "#",
        created_at: new Date()
      });
      renderChatMessages();
    }, 300);
  });
  
  // Masked Proxy Calling Action (Section 4 specs)
  callBtn.addEventListener("click", () => {
    if (!currentChat) return;
    
    const peerId = currentChat.seller_id === "p-self" ? currentChat.buyer_id : currentChat.seller_id;
    const peer = DB.profiles.find(p => p.id === peerId) || { full_name: "Arjun Kumar", mobile_number: "+919988776655" };
    
    alert(`[VOICE MASKING CONNECTED]
Initiating voice proxy call to ${peer.full_name}...
Outgoing Proxy Number: +91 7011 251142
Destination masked. Hiding your contact number ${currentUser.mobile_number}.
Line status: Connected`);
  });
  
  // Trigger Lock Deal Navigation
  document.getElementById("btn-lock-deal-trigger").addEventListener("click", () => {
    if (!currentChat) return;
    navigateTo("screen-deal");
    initDealScreenData();
  });
  
  // Back
  document.getElementById("btn-back-chat-feed").addEventListener("click", () => {
    navigateTo("screen-feed");
    renderFeedListings();
  });
}

// ============================================================================
// 8. SCREEN 5 LOGIC: CONFIRM DEAL FLOW & FLAT FEE
// ============================================================================
function initDealScreenData() {
  if (!currentChat) return;
  
  const peerId = currentChat.seller_id === "p-self" ? currentChat.buyer_id : currentChat.seller_id;
  const peer = DB.profiles.find(p => p.id === peerId) || { full_name: "Arjun Kumar" };
  
  // Update UI Card names
  document.getElementById("deal-user-traveler").innerText = peer.full_name.charAt(0).toUpperCase();
  
  // Negotiated price calculation based on bounty offered
  const bounty = currentChat.negotiated_price;
  document.getElementById("deal-breakdown-negotiated").innerText = `₹${bounty}`;
  
  // Back
  document.getElementById("btn-back-chat").addEventListener("click", () => {
    navigateTo("screen-chat");
  });
  
  // Accept & Lock Final Deal (Section 5 confirm flow)
  const confirmBtn = document.getElementById("btn-confirm-deal-final");
  
  confirmBtn.onclick = () => {
    confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Finalizing Deal & Payout Structure...`;
    
    setTimeout(() => {
      // Archive listing from feed, matching state locked
      const matchingListing = DB.listingsSender.find(l => l.id === currentChat.listing_id) || DB.listingsTraveler.find(l => l.id === currentChat.listing_id);
      if (matchingListing) {
        matchingListing.status = "matched"; // archived from public feeds
      }
      
      // Store Deal state
      const newDeal = {
        id: "d-" + (DB.deals.length + 1),
        chat_id: currentChat.id,
        sender_id: currentChat.seller_id === "p-self" ? "p-self" : peerId,
        traveler_id: currentChat.seller_id === "p-self" ? peerId : "p-self",
        negotiated_price: bounty,
        deal_status: "locked",
        platform_fee: 0 // ₹10 - ₹10 launch discount = 0
      };
      DB.deals.push(newDeal);
      
      // Push system success notification text into chat
      DB.messages.push({
        id: "msg-" + (DB.messages.length + 1),
        chat_id: currentChat.id,
        sender_id: "system",
        message_type: "text",
        content: `🔒 [SYSTEM STATUS]: Deal Locked! Platform fee is ₹0. Listing archived from public feeds. Coordination structure established.`,
        created_at: new Date()
      });
      
      // Auto trigger the 5-Minute Proximity GPS alarm system simulator in 3 seconds to demonstrate Feature B
      const trainNumber = "12302"; // Rajdhani
      const targetStation = "HWH"; // Kolkata destination station
      
      alert(`🎉 Deal Confirmed!
Listing is now archived.
[TRAIN TELEMETRY LINKED]: GPS tracking activated for Traveler on Train ${trainNumber} to ${targetStation}.
Simulated Geofenced tracking will run in the status bar!`);
      
      confirmBtn.innerHTML = `Accept & Lock Deal <i class="fa-solid fa-lock"></i>`;
      
      // Return to Chat View
      initChatThread(matchingListing || { id: currentChat.listing_id, from_station_code: "NDLS", to_station_code: "HWH" }, currentChat.listing_type, peer);
      
      // Spawn Background GPS simulation (Feature B Proximity Alert)
      startTelemetrySim(trainNumber, targetStation);
    }, 1500);
  };
}

// ============================================================================
// 9. SIMULATOR PANEL CONTROLLER FUNCTIONS
// ============================================================================
function initSimulatorControllers() {
  const toggleViewBtn = document.getElementById("toggle-view-btn");
  const deviceFrame = document.getElementById("device-frame");
  const toggleNetworkBtn = document.getElementById("toggle-network-btn");
  const wifiIcon = document.getElementById("app-wifi-icon");
  const testAlarmBtn = document.getElementById("test-alarm-btn");
  const dismissAlarmBtn = document.getElementById("btn-alarm-dismiss");
  const telSimBtn = document.getElementById("telemetry-sim-btn");
  
  // Toggle Desktop View vs Phone frame view
  toggleViewBtn.addEventListener("click", () => {
    isDesktopView = !isDesktopView;
    if (isDesktopView) {
      deviceFrame.classList.add("full-screen-mode");
      toggleViewBtn.innerHTML = `<i class="fa-solid fa-mobile-button"></i> Switch to Mobile Frame`;
    } else {
      deviceFrame.classList.remove("full-screen-mode");
      toggleViewBtn.innerHTML = `<i class="fa-solid fa-mobile-screen"></i> Toggle Desktop View`;
    }
  });
  
  // Mock Online/Offline network state
  toggleNetworkBtn.addEventListener("click", () => {
    isOnline = !isOnline;
    if (isOnline) {
      toggleNetworkBtn.innerHTML = `<i class="fa-solid fa-wifi" style="color: #25d366;"></i> Mock: Online`;
      wifiIcon.className = "fa-solid fa-wifi";
      wifiIcon.style.color = "";
    } else {
      toggleNetworkBtn.innerHTML = `<i class="fa-solid fa-plane" style="color: var(--color-error);"></i> Mock: Offline`;
      wifiIcon.className = "fa-solid fa-plane";
      wifiIcon.style.color = "var(--color-error)";
      
      // Push offline synch log to console
      console.warn("[OFFLINE SYNC]: Database disconnected. Utilizing local localstorage transaction queues...");
    }
  });
  
  // Force Alarm Test button
  testAlarmBtn.addEventListener("click", () => {
    activeTrainNumber = "12626";
    activeDestinationStation = "MAS";
    distanceToGeofence = 2.0; // km
    trainSpeedKmh = 42.0;
    triggerProximityAlarm();
  });
  
  // Dismiss Alarm Overlay action
  dismissAlarmBtn.addEventListener("click", () => {
    stopAlarmSound();
    document.getElementById("alarm-overlay").style.display = "none";
    document.getElementById("telemetry-dot").className = "status-dot active";
    document.getElementById("telemetry-text").innerText = `Proximity alarm dismissed. GPS telemetry idle.`;
  });
  
  // Telemetry Sim Speed Up
  telSimBtn.addEventListener("click", () => {
    // Jump coordinates directly to 1.8km to trigger geofence
    distanceToGeofence = 1.8;
  });
  
  // Mock current system time in notch bar
  function updateTime() {
    const timeEl = document.getElementById("status-time");
    const now = new Date();
    timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  setInterval(updateTime, 10000);
  updateTime();
}

// ============================================================================
// 10. INITIALIZATION ENTRY POINT
// ============================================================================
window.addEventListener("DOMContentLoaded", () => {
  initAuthScreen();
  initFeedScreen();
  initPostingScreen();
  initChatScreenActions();
  initSimulatorControllers();
});
