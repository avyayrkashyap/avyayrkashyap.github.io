var  mn = $(".main-nav");
    var mns = "main-nav-scrolled";
    //var hdr = $('header').height();

$(window).scroll(function() {
  if( $(this).scrollTop() > 250 ) {
    mn.addClass(mns);
  } else {
    mn.removeClass(mns);
  }
});

var heartuptimer = setInterval(heartup, 200);
function heartup() {
  $(".heart").css("font-weight", "900");
}

var heartdowntimer = setInterval(heartdown, 500);
function heartdown() {
  $(".heart").css("font-weight", "100");
}

heartuptimer(".heart");
heartdowntimer(".heart");

// When the user scrolls the page, execute myFunction 
window.onscroll = function() {myFunction()};

// Get the navbar
var navbar = document.getElementById("navbarbg");

// Get the offset position of the navbar
var sticky = navbar.offsetTop;

// Add the sticky class to the navbar when you reach its scroll position. Remove "sticky" when you leave the scroll position
function myFunction() {
  if (window.pageYOffset >= sticky) {
    navbar.classList.add("sticky")
  } else {
    navbar.classList.remove("sticky");
  }
}