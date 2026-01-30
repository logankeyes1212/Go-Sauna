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
