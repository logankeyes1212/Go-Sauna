function sendEmail() {
  const templateParams = {
    name: document.querySelector("#name").value,
    email: document.querySelector("#email").value,
    phone: document.querySelector("#phone").value,
    location: document.querySelector("#location").value,
    message: document.querySelector("#message").value,
  }
  let requiredFieldCheck = false;

  if(templateParams.name === "") requiredFieldCheck = true;
  if(templateParams.email === "" || templateParams.email.indexOf("@") === -1) requiredFieldCheck = true;
  if(!requiredFieldCheck){
    emailjs.send("service_vfhpv7i", "template_udg5e5t", templateParams)
    .then(() => alert("Email sent").catch(() => alert("Email not sent")))
  }
};

// (function () {
//     window.addEventListener('load', function() {
//     calendar.schedulingButton.load({
//       url: 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ1JC_s4QV3Qf6Ux4MAANX8ynEaOS6Z6QEovdawFHG3mY5FF8LOEzdxRHQYuOufsG-U6jED7rR8N?gv=true',
//       color: '#A81F27',
//       label: 'Book Here',
//       target: document.getElementById('google-calendar-button'),
//     });
//   });
// })();

  (function() {
    window.addEventListener('load', function() {
      calendar.schedulingButton.load({
        url: 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ1JC_s4QV3Qf6Ux4MAANX8ynEaOS6Z6QEovdawFHG3mY5FF8LOEzdxRHQYuOufsG-U6jED7rR8N?gv=true',
        color: '#A81F27',
        label: 'Book Here',
        target: document.getElementById('google-calendar-button'),
      });

      // Use setTimeout to ensure the button is rendered before applying styles
      setTimeout(() => {
        const button = document.getElementById('google-calendar-button').nextElementSibling;
        if (button) {
          // Apply custom CSS styles to the button
          // button.style.opacity = 0.5;
          button.style.padding = '15px 30px'; // Makes the button larger by adding space inside
          button.style.fontSize = '18px';      // Makes the text larger
        }
      }, 1); // A small delay to ensure the button is available
    });
  })();