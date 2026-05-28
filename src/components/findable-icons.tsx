import * as React from "react";
import wordmarkUrl from "@/assets/findable-wordmark.svg";

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
  sw?: number;
};

function Stroke({
  d,
  size = 18,
  sw = 1.5,
  fill = "none",
  ...rest
}: IconProps & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

// Findable glyph: magnifying glass with a sparkle above it.
// Path data is the official brand glyph (viewBox 238 156 817 875).
export const Logo = ({ size = 22, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="238 156 817 875"
    aria-hidden="true"
    {...rest}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M 554 223 L 540 224 L 530 225 L 522 226 L 516 227 L 510 228 L 495 231 L 491 232 L 487 233 L 480 235 L 471 238 L 456 243 L 441 249 L 428 255 L 422 258 L 412 263 L 405 267 L 400 270 L 395 273 L 377 285 L 372 289 L 362 297 L 355 303 L 346 311 L 333 324 L 325 333 L 319 340 L 314 346 L 307 355 L 302 362 L 298 368 L 292 377 L 283 392 L 279 400 L 272 414 L 268 423 L 262 438 L 258 449 L 255 459 L 253 466 L 249 482 L 245 502 L 244 509 L 243 516 L 242 528 L 242 578 L 243 590 L 244 597 L 245 604 L 249 624 L 252 636 L 257 653 L 258 656 L 259 659 L 263 670 L 265 675 L 267 680 L 271 689 L 283 713 L 287 718 L 289 723 L 292 728 L 298 737 L 303 744 L 315 760 L 320 766 L 327 774 L 349 796 L 356 802 L 362 807 L 367 811 L 372 815 L 376 818 L 386 825 L 395 831 L 400 834 L 412 841 L 420 845 L 436 853 L 445 857 L 450 859 L 461 863 L 473 867 L 484 870 L 500 874 L 505 875 L 510 876 L 516 877 L 522 878 L 530 879 L 539 880 L 552 881 L 583 881 L 597 880 L 605 879 L 613 878 L 619 877 L 625 876 L 630 875 L 635 874 L 643 872 L 655 869 L 665 866 L 674 863 L 682 860 L 687 858 L 694 855 L 705 850 L 707 849 L 709 848 L 722 841 L 734 834 L 740 830 L 754 820 L 756 819 L 758 819 L 764 826 L 765 827 L 954 1015 L 957 1017 L 960 1019 L 966 1022 L 969 1023 L 972 1024 L 976 1025 L 982 1026 L 987 1026 L 995 1025 L 999 1024 L 1002 1023 L 1005 1022 L 1013 1018 L 1016 1016 L 1021 1012 L 1025 1008 L 1028 1004 L 1030 1001 L 1034 993 L 1036 988 L 1037 984 L 1037 977 L 1038 976 L 1038 970 L 1037 963 L 1036 959 L 1035 956 L 1034 953 L 1033 951 L 1032 949 L 1029 944 L 1027 941 L 960 873 L 957 870 L 948 862 L 932 846 L 931 845 L 873 787 L 869 783 L 830 742 L 831 740 L 835 735 L 839 729 L 844 721 L 848 714 L 860 690 L 865 679 L 867 674 L 870 666 L 874 655 L 875 652 L 879 639 L 881 632 L 883 623 L 885 614 L 886 609 L 887 603 L 888 597 L 889 590 L 890 581 L 891 570 L 891 535 L 890 522 L 889 512 L 888 505 L 886 493 L 885 487 L 883 478 L 880 466 L 878 459 L 876 452 L 872 440 L 867 427 L 865 422 L 862 415 L 858 406 L 849 389 L 840 374 L 832 362 L 823 350 L 816 341 L 808 332 L 782 306 L 774 299 L 767 293 L 751 281 L 745 277 L 736 271 L 731 268 L 726 265 L 719 261 L 699 251 L 690 247 L 683 244 L 678 242 L 669 239 L 654 234 L 643 231 L 639 230 L 635 229 L 624 227 L 617 226 L 609 225 L 600 224 L 586 223 Z M 547 301 L 585 301 L 595 302 L 603 303 L 609 304 L 614 305 L 619 306 L 623 307 L 627 308 L 634 310 L 640 312 L 649 315 L 669 323 L 673 325 L 679 328 L 688 333 L 695 337 L 707 345 L 714 350 L 718 353 L 724 358 L 731 364 L 754 387 L 759 393 L 763 398 L 766 402 L 769 406 L 773 412 L 779 421 L 782 426 L 787 435 L 789 439 L 792 445 L 796 454 L 798 459 L 800 464 L 806 482 L 809 493 L 811 502 L 812 508 L 813 514 L 814 522 L 815 530 L 816 548 L 816 556 L 815 574 L 814 584 L 813 591 L 812 597 L 811 602 L 810 607 L 809 611 L 808 615 L 806 622 L 803 632 L 802 635 L 799 643 L 797 648 L 795 653 L 791 661 L 782 679 L 779 684 L 775 690 L 769 699 L 766 703 L 763 707 L 758 713 L 753 719 L 729 743 L 722 749 L 717 753 L 709 759 L 705 762 L 694 769 L 689 772 L 680 777 L 672 781 L 663 785 L 658 787 L 653 789 L 635 795 L 628 797 L 624 798 L 615 800 L 610 801 L 604 802 L 597 803 L 588 804 L 545 804 L 535 803 L 528 802 L 513 799 L 509 798 L 505 797 L 498 795 L 480 789 L 472 786 L 459 780 L 451 776 L 444 772 L 439 769 L 433 765 L 424 759 L 420 756 L 416 753 L 411 749 L 405 744 L 380 719 L 374 712 L 370 707 L 361 695 L 353 683 L 349 676 L 344 667 L 337 652 L 331 637 L 327 625 L 325 617 L 321 601 L 320 595 L 319 589 L 318 581 L 317 569 L 317 538 L 318 526 L 319 517 L 320 510 L 321 504 L 322 499 L 324 490 L 327 479 L 329 473 L 332 464 L 338 449 L 347 431 L 352 422 L 359 411 L 361 408 L 369 397 L 373 392 L 378 386 L 387 376 L 394 369 L 404 360 L 410 355 L 422 346 L 434 338 L 439 335 L 444 332 L 452 328 L 466 321 L 481 315 L 487 313 L 496 310 L 503 308 L 507 307 L 511 306 L 516 305 L 521 304 L 528 303 L 536 302 Z M 948 160 L 945 161 L 943 162 L 940 165 L 939 167 L 938 171 L 935 186 L 933 193 L 930 202 L 928 207 L 926 209 L 925 213 L 923 217 L 921 220 L 919 223 L 916 227 L 910 233 L 905 237 L 902 239 L 888 246 L 883 248 L 880 249 L 877 250 L 867 253 L 856 255 L 853 256 L 850 258 L 848 260 L 847 262 L 847 270 L 849 272 L 849 273 L 850 274 L 851 274 L 853 276 L 858 277 L 862 277 L 878 281 L 881 282 L 884 283 L 891 286 L 903 292 L 907 295 L 911 299 L 912 299 L 915 302 L 920 308 L 923 312 L 925 316 L 930 326 L 932 332 L 935 341 L 937 348 L 938 355 L 939 359 L 940 361 L 941 363 L 942 364 L 943 364 L 945 366 L 953 366 L 955 364 L 956 364 L 957 363 L 958 361 L 959 359 L 960 356 L 961 353 L 962 347 L 965 338 L 968 330 L 970 325 L 972 321 L 975 315 L 978 310 L 980 307 L 986 300 L 990 296 L 994 293 L 997 291 L 1011 284 L 1016 282 L 1025 279 L 1041 276 L 1044 275 L 1046 274 L 1048 272 L 1049 270 L 1050 268 L 1050 262 L 1049 260 L 1048 258 L 1047 257 L 1045 256 L 1043 255 L 1035 254 L 1031 253 L 1024 251 L 1017 249 L 1014 248 L 1009 246 L 995 239 L 992 237 L 980 225 L 975 217 L 971 209 L 968 201 L 967 198 L 967 195 L 965 192 L 963 185 L 960 170 L 959 167 L 958 165 L 955 162 L 953 161 L 950 160 Z"
    />
  </svg>
);

export const Plus = (p: IconProps) => <Stroke {...p} d="M10 4v12 M4 10h12" />;
export const PlusSm = (p: IconProps) => <Stroke size={14} {...p} d="M10 4v12 M4 10h12" />;
export const Search = (p: IconProps) => (
  <Stroke {...p} d="M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3 Z M13.5 13.5 L17 17" />
);
export const Folder = (p: IconProps) => (
  <Stroke
    {...p}
    d="M3 5.5C3 4.7 3.7 4 4.5 4h3.2c.4 0 .8.15 1.05.42L9.8 5.3h5.7C16.3 5.3 17 6 17 6.8v7.7c0 .8-.7 1.5-1.5 1.5h-11C3.7 16 3 15.3 3 14.5Z"
  />
);
export const ChevDown = (p: IconProps) => <Stroke {...p} d="M5 7.5 L10 12.5 L15 7.5" />;
export const ChevRight = (p: IconProps) => <Stroke {...p} d="M7.5 5 L12.5 10 L7.5 15" />;
export const Dots = (p: IconProps) => (
  <Stroke sw={2.5} {...p} d="M5 10h.01 M10 10h.01 M15 10h.01" />
);
export const Send = (p: IconProps) => <Stroke {...p} d="M3 10 L17 3 L13 17 L9.5 11.5 Z M9.5 11.5 L17 3" />;
export const Attach = (p: IconProps) => (
  <Stroke
    {...p}
    d="M14 6.5 L7.5 13a2.5 2.5 0 0 0 3.5 3.5l7-7a4 4 0 0 0-5.7-5.7l-7.5 7.5a5.5 5.5 0 0 0 7.8 7.8L17 14"
  />
);
export const Sparkle = (p: IconProps) => (
  <Stroke
    {...p}
    d="M10 2 L11.5 7 L17 8.5 L11.5 10 L10 15 L8.5 10 L3 8.5 L8.5 7 Z M16 14 L16.7 16 L18.5 16.5 L16.7 17 L16 19 L15.3 17 L13.5 16.5 L15.3 16 Z"
  />
);
export const X = (p: IconProps) => <Stroke {...p} d="M5 5 L15 15 M15 5 L5 15" />;
export const XSm = (p: IconProps) => <Stroke size={12} sw={1.8} {...p} d="M5 5 L15 15 M15 5 L5 15" />;
export const Edit = (p: IconProps) => <Stroke {...p} d="M4 16 L4 13 L13 4 L16 7 L7 16 Z M11 6 L14 9" />;
export const Pin = (p: IconProps) => <Stroke {...p} d="M10 2 L13 5 L13 9 L16 12 L4 12 L7 9 L7 5 Z M10 12 L10 18" />;
export const Side = (p: IconProps) => <Stroke {...p} d="M3 4h14v12H3z M8 4v12" />;
export const Sun = (p: IconProps) => (
  <Stroke
    {...p}
    d="M10 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M10 1v2 M10 17v2 M1 10h2 M17 10h2 M3.5 3.5 L5 5 M15 15 L16.5 16.5 M3.5 16.5 L5 15 M15 5 L16.5 3.5"
  />
);
export const Moon = (p: IconProps) => <Stroke {...p} d="M16 12.5A6.5 6.5 0 0 1 7.5 4 a7 7 0 1 0 8.5 8.5Z" />;
export const Briefcase = (p: IconProps) => (
  <Stroke {...p} d="M3 7h14v9H3z M7 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M3 11h14" />
);
export const Megaphone = (p: IconProps) => (
  <Stroke {...p} d="M3 8v4 a1 1 0 0 0 1 1 h2 L13 17 V3 L6 7 H4 a1 1 0 0 0-1 1Z M13 7 a3 3 0 0 1 0 6" />
);
export const Users = (p: IconProps) => (
  <Stroke
    {...p}
    d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M2 17c.4-2.8 2.6-5 5-5s4.6 2.2 5 5 M14 10a2.5 2.5 0 1 0 0-5 M14 12c2.2.2 4 1.9 4.5 4"
  />
);
export const Calendar = (p: IconProps) => <Stroke {...p} d="M3 5h14v12H3z M3 8h14 M7 3v3 M13 3v3" />;
export const Chat = (p: IconProps) => <Stroke {...p} d="M3 4h14v9H8l-4 4V13H3Z" />;
export const Check = (p: IconProps) => <Stroke {...p} d="M4 10.5 L8 14.5 L16 5.5" />;
export const Copy = (p: IconProps) => <Stroke {...p} d="M7 7h9v9H7z M4 4h9v3 M4 4v9h3" />;
export const ArrowRight = (p: IconProps) => <Stroke {...p} d="M4 10h12 M11 5 L16 10 L11 15" />;
export const Bell = (p: IconProps) => (
  <Stroke {...p} d="M10 3a5 5 0 0 0-5 5v3l-1.5 2h13L15 11V8a5 5 0 0 0-5-5Z M8 16a2 2 0 0 0 4 0" />
);
export const LogOut = (p: IconProps) => (
  <Stroke {...p} d="M8 3H3v14h5 M13 6 L17 10 L13 14 M7 10h10" />
);
export const Star = ({ fill = "none", ...p }: IconProps) => (
  <Stroke fill={fill} {...p} d="M10 2.5 L12.2 7.4 L17.5 8 L13.5 11.6 L14.7 17 L10 14.3 L5.3 17 L6.5 11.6 L2.5 8 L7.8 7.4 Z" />
);
export const Linkedin = (p: IconProps) => (
  <Stroke {...p} d="M3 4.5h2.5v12H3z M4.25 2.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z M8 7.5h2.4v1.6c.4-.8 1.4-1.8 3-1.8 2.4 0 3.1 1.5 3.1 3.6v5.6H14V11.3c0-1 -.4-1.7-1.4-1.7-1 0-1.6.7-1.6 1.7v5.2H8.6Z" />
);
export const Doc = (p: IconProps) => (
  <Stroke {...p} d="M5 3h7l3 3v11H5z M12 3v3h3 M7 10h6 M7 13h6" />
);
export const Pencil = (p: IconProps) => (
  <Stroke {...p} d="M3 17l3-1 9-9-2-2-9 9-1 3Z M12 5l3 3" />
);
export const Upload = (p: IconProps) => (
  <Stroke {...p} d="M10 3v10 M5 8 L10 3 L15 8 M4 16h12" />
);

export const Wordmark = ({
  height = 22,
  className,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { height?: number }) => (
  <img
    src={wordmarkUrl}
    alt="findable.work"
    height={height}
    style={{ height, width: "auto" }}
    className={className}
    {...rest}
  />
);