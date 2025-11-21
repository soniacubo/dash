document.addEventListener("DOMContentLoaded", function(){
  var links = document.querySelectorAll(".top-nav-items a.nav-item");
  var path = (location.pathname || "").split("/").pop().toLowerCase();
  for (var i=0;i<links.length;i++){
    var href = (links[i].getAttribute("href")||"").toLowerCase();
    if (href === path) { links[i].classList.add("active"); } else { links[i].classList.remove("active"); }
  }
});
