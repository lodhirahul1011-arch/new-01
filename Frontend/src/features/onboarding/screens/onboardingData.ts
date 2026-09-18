type OnboardingSlide = {
  id: number;
  title: string;
  description: string;
  image: number;
  descriptionFontSize?: number;
};

export const onboardingData: OnboardingSlide[] = [

{
 id:1,
 title:"Welcome to Dvaari",
 description:"Your smart doorstep, always within reach.\nSee who's at your door in real time, receive instant visitor alerts, and stay connected to your home wherever you are.",
 image:require("../../../assets/images/onboarding/onboarding1.jpg")
},

{
 id:2,
 title:"Verified Deliveries",
 description:"Monitor visitors, verify deliveries, and receive packages securely from anywhere.",
 image:require("../../../assets/images/onboarding/onboarding2.jpg")
},

{
 id:3,
 title:"Family Connected",
 description:"One home. One connected experience.\nManage access, track deliveries, and keep your household informed all in one place.",
 image:require("../../../assets/images/onboarding/onboarding3.jpg")
},

{
 id:4,
 title:"Simple For Everyone",
 description:"Designed for every generation.\nFrom tech-savvy teens to loving grandparents just tap your card to get started.",
 image:require("../../../assets/images/onboarding/onboarding4.jpg")
}

]